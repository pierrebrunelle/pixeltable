from unittest.mock import MagicMock

import numpy as np
import pyarrow as pa
from PIL import Image

import pixeltable as pxt

from ..utils import skip_test_if_not_installed


class TestRerun:
    def test_basic_scalar_types(self, uses_db: None) -> None:
        """Scalar columns (int, float, string, bool) round-trip through send_to_rerun."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_scalars', {'id': pxt.Int, 'name': pxt.String, 'score': pxt.Float})
        t.insert(
            [
                {'id': 1, 'name': 'alice', 'score': 0.9},
                {'id': 2, 'name': 'bob', 'score': 0.8},
                {'id': 3, 'name': 'carol', 'score': 0.7},
            ]
        )

        batch = pxt.io.send_to_rerun(t)
        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 3
        assert set(batch.schema.names) >= {'id', 'name', 'score'}
        assert batch.column('id').to_pylist() == [1, 2, 3]
        assert batch.column('name').to_pylist() == ['alice', 'bob', 'carol']

    def test_column_selection(self, uses_db: None) -> None:
        """Only the requested columns appear in the RecordBatch."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_cols', {'id': pxt.Int, 'name': pxt.String, 'score': pxt.Float})
        t.insert(id=1, name='alice', score=0.9)

        batch = pxt.io.send_to_rerun(t, columns=[t.id, t.name])
        assert batch.num_rows == 1
        assert set(batch.schema.names) == {'id', 'name'}

    def test_image_column(self, uses_db: None) -> None:
        """Image columns are represented as descriptive strings."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_img', {'id': pxt.Int, 'image': pxt.Image})
        img = Image.fromarray(np.random.randint(0, 256, (64, 48, 3), dtype=np.uint8))
        t.insert(id=1, image=img)

        batch = pxt.io.send_to_rerun(t)
        assert batch.num_rows == 1
        img_val = batch.column('image')[0].as_py()
        assert 'Image(' in img_val
        assert '64' in img_val and '48' in img_val

    def test_json_column(self, uses_db: None) -> None:
        """JSON columns are serialized to strings."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_json', {'id': pxt.Int, 'metadata': pxt.Json})
        t.insert([{'id': 1, 'metadata': {'key': 'value', 'count': 42}}, {'id': 2, 'metadata': None}])

        batch = pxt.io.send_to_rerun(t)
        assert batch.num_rows == 2
        meta_col = batch.column('metadata').to_pylist()
        assert '"key"' in meta_col[0]
        assert meta_col[1] is None

    def test_nullable_values(self, uses_db: None) -> None:
        """Null values are preserved across all column types."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_null', {'id': pxt.Int, 'name': pxt.String, 'score': pxt.Float})
        t.insert([{'id': 1, 'name': 'alice', 'score': 0.9}, {'id': 2, 'name': None, 'score': None}])

        batch = pxt.io.send_to_rerun(t)
        assert batch.num_rows == 2
        assert batch.column('name').to_pylist() == ['alice', None]
        assert batch.column('score').to_pylist()[1] is None

    def test_custom_table_name(self, uses_db: None) -> None:
        """A custom table_name is forwarded to the viewer."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_name', {'id': pxt.Int})
        t.insert(id=1)

        mock_viewer = MagicMock()
        pxt.io.send_to_rerun(t, table_name='My Custom Table', viewer=mock_viewer)
        mock_viewer.send_table.assert_called_once()
        call_args = mock_viewer.send_table.call_args
        assert call_args[0][0] == 'My Custom Table'
        assert isinstance(call_args[0][1], pa.RecordBatch)

    def test_viewer_integration(self, uses_db: None) -> None:
        """When a viewer is provided, send_table is called on it."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_viewer', {'id': pxt.Int, 'name': pxt.String})
        t.insert(id=1, name='test')

        mock_viewer = MagicMock()
        batch = pxt.io.send_to_rerun(t, viewer=mock_viewer)

        mock_viewer.send_table.assert_called_once()
        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 1

    def test_dry_run(self, uses_db: None) -> None:
        """Without viewer or addr, the RecordBatch is returned without sending."""
        skip_test_if_not_installed('rerun')

        t = pxt.create_table('test_rerun_dry', {'id': pxt.Int})
        t.insert(id=1)

        batch = pxt.io.send_to_rerun(t)
        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 1
