"""Ray Data integration for Pixeltable.

Provides :class:`PixeltableDatasource` and :class:`PixeltableDatasink` for reading and
writing Pixeltable tables as `Ray Datasets
<https://docs.ray.io/en/latest/data/data.html>`_, enabling distributed data processing.

**Distributed read requirement**: All Ray workers must have access to the same
Pixeltable database. For local Ray clusters this works automatically (shared filesystem).
For multi-node clusters, configure Pixeltable to use a remote PostgreSQL backend.

Example:
    ```python
    import ray
    import pixeltable as pxt
    from pixeltable.io.ray import PixeltableDatasource, PixeltableDatasink

    # Read a Pixeltable table as a Ray Dataset
    ds = ray.data.read_datasource(
        PixeltableDatasource('my_dir.my_table', columns=['text', 'label']),
        parallelism=8,
    )

    # Transform and write back to Pixeltable
    ds.write_datasink(PixeltableDatasink('my_dir.results'))
    ```
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Iterable, Iterator, Optional

import pyarrow as pa

import pixeltable.type_system as ts

# Import Ray base classes if available; fall back to plain `object` so this
# module can be imported even when Ray is not installed.
try:
    from ray.data.datasource.datasink import Datasink as _RayDatasink
    from ray.data.datasource.datasource import Datasource as _RayDatasource
except ImportError:
    _RayDatasource = object
    _RayDatasink = object

if TYPE_CHECKING:
    import pixeltable as pxt

_logger = logging.getLogger(__name__)

# Target batch size for read partitions: 64 MiB
_DEFAULT_BATCH_SIZE_BYTES = 64 * 1024 * 1024


def _pxt_schema_to_arrow(schema: dict[str, ts.ColumnType]) -> Optional[pa.Schema]:
    """Convert a Pixeltable column schema to a PyArrow schema.

    Returns None if any column type cannot be statically mapped (e.g. JSON, unknown-shape
    arrays), in which case Ray will infer the schema from the first data batch.
    """
    from pixeltable.utils.arrow import to_arrow_type

    fields: list[pa.Field] = []
    for col_name, col_type in schema.items():
        if col_type.is_json_type():
            return None  # dynamic struct schema; let Ray infer
        if isinstance(col_type, ts.ArrayType) and (col_type.shape is None or any(d is None for d in col_type.shape)):
            return None  # ragged array; let Ray infer
        arrow_type = to_arrow_type(col_type)
        if arrow_type is None:
            return None
        fields.append(pa.field(col_name, arrow_type))
    return pa.schema(fields)


def _read_partition(
    table_path: str, columns: Optional[list[str]], row_offset: int, row_limit: int
) -> Iterator[pa.Table]:
    """Read a row-range partition of a Pixeltable table as PyArrow Tables.

    Runs on Ray workers. Reconstructs the Pixeltable connection from scratch using
    only picklable primitives; no Pixeltable objects are captured in closures.
    """
    import pixeltable as pxt
    from pixeltable.utils.arrow import to_record_batches

    table = pxt.get_table(table_path)

    if columns is not None:
        col_exprs = [getattr(table, c) for c in columns]
        query: pxt.Query = table.select(*col_exprs)
    else:
        query = table.select()

    query = query.limit(row_limit, offset=row_offset)

    for batch in to_record_batches(query, batch_size_bytes=_DEFAULT_BATCH_SIZE_BYTES):
        yield pa.Table.from_batches([batch])


def _write_block(table_path: str, block: pa.Table) -> int:
    """Insert a PyArrow Table block into a Pixeltable table. Returns rows written."""
    import pixeltable as pxt

    table = pxt.get_table(table_path)
    rows: list[dict[str, Any]] = block.to_pylist()
    table.insert(rows)
    return len(rows)


class PixeltableDatasource(_RayDatasource):
    """Ray Data Datasource for reading from Pixeltable tables.

    Partitions the table by row ranges (LIMIT/OFFSET) for parallel reading across
    Ray workers. Schema is inferred statically from Pixeltable column types; if a
    column type cannot be mapped statically (JSON, ragged arrays), Ray infers the
    schema from the first data batch.

    Args:
        table_path: Fully qualified Pixeltable table path (e.g. ``'my_dir.my_table'``).
        columns: Column names to read. Reads all columns when ``None``.

    Example:
        ```python
        import ray
        from pixeltable.io.ray import PixeltableDatasource

        ds = ray.data.read_datasource(
            PixeltableDatasource('my_dir.my_table', columns=['text', 'label']),
            parallelism=8,
        )
        ds.show(5)
        ```
    """

    def __init__(self, table_path: str, columns: Optional[list[str]] = None) -> None:
        self.table_path = table_path
        self.columns = columns
        self._total_rows: Optional[int] = None
        self._arrow_schema: Optional[pa.Schema] = None

    def _load_table_info(self) -> tuple[int, Optional[pa.Schema]]:
        """Fetch row count and schema from Pixeltable on the driver."""
        if self._total_rows is not None:
            return self._total_rows, self._arrow_schema

        import pixeltable as pxt

        table = pxt.get_table(self.table_path)

        if self.columns is not None:
            col_exprs = [getattr(table, c) for c in self.columns]
            query: pxt.Query = table.select(*col_exprs)
        else:
            query = table.select()

        self._total_rows = query.count()
        self._arrow_schema = _pxt_schema_to_arrow(query.schema)
        return self._total_rows, self._arrow_schema

    def get_name(self) -> str:
        return 'Pixeltable'

    def get_read_tasks(self, parallelism: int, per_task_row_limit: Optional[int] = None, **kwargs: Any) -> list:
        """Partition the table into ``parallelism`` read tasks for Ray workers."""
        from ray.data import ReadTask
        from ray.data.block import BlockMetadata

        total_rows, arrow_schema = self._load_table_info()

        if total_rows == 0:
            return []

        # Cap parallelism to actual row count (one row per task minimum)
        parallelism = min(parallelism, total_rows)
        rows_per_task, remainder = divmod(total_rows, parallelism)

        tasks: list[ReadTask] = []
        offset = 0
        for i in range(parallelism):
            # Distribute remainder rows one-per-task across leading tasks
            task_rows = rows_per_task + (1 if i < remainder else 0)
            task_offset = offset

            metadata = BlockMetadata(num_rows=task_rows, size_bytes=None, input_files=None, exec_stats=None)

            # Capture only picklable primitives (str, int, list[str]|None)
            read_fn = lambda o=task_offset, n=task_rows: _read_partition(  # noqa: E731
                self.table_path, self.columns, o, n
            )

            tasks.append(ReadTask(read_fn, metadata, schema=arrow_schema))
            offset += task_rows

        return tasks

    def estimate_inmemory_data_size(self) -> Optional[int]:
        """Return None; in-memory size is unknown without fetching data."""
        return None


class PixeltableDatasink(_RayDatasink):
    """Ray Data Datasink for writing to Pixeltable tables.

    The target table must already exist in Pixeltable. Each Ray worker calls
    ``table.insert()`` independently; Pixeltable's PostgreSQL backend handles
    concurrent inserts via transactions.

    Args:
        table_path: Fully qualified Pixeltable table path (e.g. ``'my_dir.my_table'``).

    Example:
        ```python
        import ray
        from pixeltable.io.ray import PixeltableDatasink

        ds = ray.data.range(100)
        ds.write_datasink(PixeltableDatasink('my_dir.my_table'))
        ```
    """

    def __init__(self, table_path: str) -> None:
        self.table_path = table_path

    def get_name(self) -> str:
        return 'Pixeltable'

    @property
    def supports_distributed_writes(self) -> bool:
        return True

    @property
    def min_rows_per_write(self) -> Optional[int]:
        return None

    def write(self, blocks: Iterable[pa.Table], ctx: Any) -> int:
        """Write blocks to the Pixeltable table. Returns total rows written."""
        total = 0
        for block in blocks:
            if block.num_rows > 0:
                total += _write_block(self.table_path, block)
        return total

    def on_write_start(self, schema: Any = None) -> None:
        """Called on the driver before write tasks launch. No-op for Pixeltable."""

    def on_write_complete(self, write_result: Any) -> None:
        """Log total rows written after all worker tasks complete."""
        write_returns = getattr(write_result, 'write_returns', write_result)
        total = sum(r for r in write_returns if r is not None) if write_returns else 0
        _logger.info('PixeltableDatasink: wrote %d rows to %r', total, self.table_path)

    def on_write_failed(self, error: Exception) -> None:
        """Called on a best-effort basis when a write job fails. No-op."""


def read_pixeltable(table_path: str, *, columns: Optional[list[str]] = None, parallelism: int = -1) -> Any:
    """Read a Pixeltable table as a Ray Dataset.

    This is a convenience wrapper around
    ``ray.data.read_datasource(PixeltableDatasource(...))``.

    Args:
        table_path: Fully qualified Pixeltable table path (e.g. ``'my_dir.my_table'``).
        columns: Column names to read. Reads all columns when ``None``.
        parallelism: Number of parallel read tasks. ``-1`` lets Ray choose automatically.

    Returns:
        A Ray Dataset containing the table data as PyArrow record batches.

    Example:
        ```python
        import pixeltable.io.ray as pxt_ray

        ds = pxt_ray.read_pixeltable('my_dir.my_table', columns=['text', 'label'])
        ds.show(5)
        ```
    """
    import ray.data

    return ray.data.read_datasource(PixeltableDatasource(table_path, columns=columns), parallelism=parallelism)
