"""Utilities for exporting Pixeltable table data to Rerun."""

from __future__ import annotations

import json
from typing import Any

import pyarrow as pa

import pixeltable as pxt
import pixeltable.type_system as ts


def to_rerun_record_batch(tbl: pxt.Table, columns: list[Any] | None = None) -> tuple[pa.RecordBatch, str]:
    """Convert Pixeltable table data to a PyArrow RecordBatch suitable for Rerun's send_table API.

    Scalar types (int, float, string, bool, date, timestamp) are passed through directly.
    Media types (image, video, audio, document) are converted to string representations.
    JSON values are serialized as strings. Array values are stringified.

    Args:
        tbl: The Pixeltable table to export.
        columns: Optional list of column expressions to include. If None, all columns are selected.

    Returns:
        A tuple of (RecordBatch, table_name).
    """
    if columns is not None:
        query = tbl.select(*columns)
    else:
        query = tbl.select()

    result = query.collect()
    schema = result.schema

    col_data: dict[str, list[Any]] = {}
    for col_idx, (col_name, col_type) in enumerate(schema.items()):
        values: list[Any] = []
        for row in result._rows:
            values.append(_convert_value(row[col_idx], col_type))
        col_data[col_name] = values

    return pa.RecordBatch.from_pydict(col_data), tbl._name


def send_record_batch(viewer: Any, name: str, record_batch: pa.RecordBatch) -> None:
    """Send a RecordBatch to a Rerun viewer, handling API differences.

    ``rerun_notebook.Viewer.send_table`` accepts Arrow IPC bytes.
    ``rerun.experimental.ViewerClient.send_table`` accepts ``(name, RecordBatch)``.
    """
    import inspect

    sig = inspect.signature(viewer.send_table)
    if len(sig.parameters) == 1:
        # rerun_notebook.Viewer: send_table(data: bytes) — Arrow IPC file format
        sink = pa.BufferOutputStream()
        writer = pa.ipc.new_file(sink, record_batch.schema)
        writer.write_batch(record_batch)
        writer.close()
        viewer.send_table(sink.getvalue().to_pybytes())
    else:
        # rerun.experimental.ViewerClient: send_table(name, table)
        viewer.send_table(name, record_batch)


def _convert_value(val: Any, col_type: ts.ColumnType) -> Any:
    """Convert a Pixeltable cell value to an Arrow-compatible value for Rerun display."""
    import PIL.Image

    if val is None:
        return None
    if col_type.is_image_type():
        if isinstance(val, PIL.Image.Image):
            return f'Image({val.width}x{val.height}, {val.mode})'
        return str(val)
    if col_type.is_media_type():
        return str(val)
    if col_type.is_json_type():
        return json.dumps(val)
    if col_type.is_array_type():
        return str(val.tolist()) if hasattr(val, 'tolist') else str(val)
    if col_type.is_uuid_type():
        return str(val)
    return val
