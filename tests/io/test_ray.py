"""Tests for the Ray Data integration (PixeltableDatasource / PixeltableDatasink)."""

import numpy as np
import pyarrow as pa

import pixeltable as pxt
from pixeltable.io.ray import PixeltableDatasink, PixeltableDatasource, read_pixeltable

from ..utils import skip_test_if_not_installed


class TestRayDatasource:
    """Tests for reading Pixeltable tables via PixeltableDatasource."""

    def test_read_basic(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')
        import ray

        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        n_rows = 50
        t = pxt.create_table('source', {'id': pxt.Int, 'value': pxt.Float, 'label': pxt.String})
        t.insert([{'id': i, 'value': float(i) * 1.5, 'label': f'item_{i}'} for i in range(n_rows)])

        ds = ray.data.read_datasource(PixeltableDatasource('source'), parallelism=4)

        result_df = ds.to_pandas()
        assert len(result_df) == n_rows
        assert set(result_df.columns) == {'id', 'value', 'label'}
        assert sorted(result_df['id'].tolist()) == list(range(n_rows))

    def test_read_column_selection(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')
        import ray

        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        t = pxt.create_table('proj', {'id': pxt.Int, 'text': pxt.String, 'score': pxt.Float})
        t.insert([{'id': i, 'text': f'row_{i}', 'score': float(i)} for i in range(20)])

        ds = ray.data.read_datasource(PixeltableDatasource('proj', columns=['id', 'text']), parallelism=2)

        result_df = ds.to_pandas()
        assert set(result_df.columns) == {'id', 'text'}
        assert 'score' not in result_df.columns
        assert len(result_df) == 20

    def test_read_empty_table(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')

        pxt.create_table('empty', {'id': pxt.Int, 'value': pxt.String})

        datasource = PixeltableDatasource('empty')
        tasks = datasource.get_read_tasks(parallelism=4)
        assert tasks == []

    def test_read_parallelism_capped_by_row_count(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')

        t = pxt.create_table('small', {'id': pxt.Int})
        t.insert([{'id': i} for i in range(3)])

        datasource = PixeltableDatasource('small')
        tasks = datasource.get_read_tasks(parallelism=10)
        assert len(tasks) == 3

    def test_read_with_array_column(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')
        import ray

        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        t = pxt.create_table('arrays', {'id': pxt.Int, 'embedding': pxt.Array[(4,), pxt.Float]})  # type: ignore[misc]
        t.insert([{'id': i, 'embedding': np.array([float(i)] * 4, dtype=np.float32)} for i in range(10)])

        ds = ray.data.read_datasource(PixeltableDatasource('arrays'), parallelism=2)

        result_df = ds.to_pandas()
        assert len(result_df) == 10
        assert 'embedding' in result_df.columns

    def test_read_convenience_function(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')
        import ray

        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        t = pxt.create_table('conv', {'id': pxt.Int, 'text': pxt.String})
        t.insert([{'id': i, 'text': f'hello_{i}'} for i in range(15)])

        ds = read_pixeltable('conv', columns=['id', 'text'], parallelism=3)

        result_df = ds.to_pandas()
        assert len(result_df) == 15
        assert set(result_df.columns) == {'id', 'text'}

    def test_estimate_inmemory_data_size(self, uses_db: None) -> None:
        pxt.create_table('any', {'id': pxt.Int})
        datasource = PixeltableDatasource('any')
        assert datasource.estimate_inmemory_data_size() is None

    def test_schema_static_types(self, uses_db: None) -> None:
        """Schema is returned statically for primitive column types."""
        t = pxt.create_table('schema_t', {'id': pxt.Int, 'name': pxt.String, 'score': pxt.Float})
        t.insert([{'id': 1, 'name': 'a', 'score': 1.0}])

        datasource = PixeltableDatasource('schema_t')
        total, schema = datasource._load_table_info()

        assert total == 1
        assert schema is not None
        assert schema.field('id').type == pa.int64()
        assert schema.field('name').type == pa.string()
        assert schema.field('score').type == pa.float32()

    def test_schema_json_column_returns_none(self, uses_db: None) -> None:
        """Schema is None when table has JSON columns (Ray infers from data)."""
        t = pxt.create_table('json_schema', {'id': pxt.Int, 'meta': pxt.Json})
        t.insert([{'id': 1, 'meta': {'key': 'val'}}])

        datasource = PixeltableDatasource('json_schema')
        _, schema = datasource._load_table_info()

        assert schema is None


class TestRayDatasink:
    """Tests for writing Ray Datasets to Pixeltable via PixeltableDatasink."""

    def test_write_basic(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')
        import ray

        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        target = pxt.create_table('target', {'id': pxt.Int, 'value': pxt.Float})

        ds = ray.data.from_items([{'id': i, 'value': float(i) * 2.0} for i in range(30)])
        ds.write_datasink(PixeltableDatasink('target'))

        result = target.collect()
        assert len(result) == 30
        assert sorted(result['id']) == list(range(30))

    def test_write_name(self, uses_db: None) -> None:
        pxt.create_table('any', {'id': pxt.Int})
        sink = PixeltableDatasink('any')
        assert sink.get_name() == 'Pixeltable'

    def test_write_supports_distributed(self, uses_db: None) -> None:
        pxt.create_table('any', {'id': pxt.Int})
        sink = PixeltableDatasink('any')
        assert sink.supports_distributed_writes is True

    def test_roundtrip(self, uses_db: None) -> None:
        """Read from one table, transform with Ray, write to another."""
        skip_test_if_not_installed('ray')
        import ray

        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        n_rows = 20
        source = pxt.create_table('rt_source', {'id': pxt.Int, 'value': pxt.Float})
        source.insert([{'id': i, 'value': float(i)} for i in range(n_rows)])

        dest = pxt.create_table('rt_dest', {'id': pxt.Int, 'value': pxt.Float})

        ds = ray.data.read_datasource(PixeltableDatasource('rt_source'), parallelism=2)
        ds.write_datasink(PixeltableDatasink('rt_dest'))

        result = dest.collect()
        assert len(result) == n_rows
        assert sorted(result['id']) == list(range(n_rows))

    def test_write_multiple_parallelism_levels(self, uses_db: None) -> None:
        skip_test_if_not_installed('ray')
        import ray

        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        for parallelism in [1, 2, 5]:
            # Fresh tables per parallelism level (uses_db already reset DB)
            src_name = f'par_src_{parallelism}'
            dst_name = f'par_{parallelism}'
            source = pxt.create_table(src_name, {'id': pxt.Int})
            source.insert([{'id': i} for i in range(10)])
            dest = pxt.create_table(dst_name, {'id': pxt.Int})

            ds = ray.data.read_datasource(PixeltableDatasource(src_name), parallelism=parallelism)
            ds.write_datasink(PixeltableDatasink(dst_name))

            result = dest.collect()
            assert len(result) == 10, f'Failed for parallelism={parallelism}'
