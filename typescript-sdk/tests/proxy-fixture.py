"""Generate binary protocol fixtures without opening a Pixeltable database."""

import base64
import datetime
import io
import json
from pathlib import Path
from uuid import UUID

import numpy as np

from pixeltable.catalog.path import Path as CatalogPath
from pixeltable.metadata import VERSION
from pixeltable.service import proxy_protocol as protocol
from pixeltable.type_system import IntType

sink = protocol.InlinePartSink()
value = {
    'text': 'café / 日本語',
    'bytes': b'\x00\xff\x10',
    'empty': b'',
    'reserved': {'$pxt': 'user data', '__proto__': {'safe': True}},
    'values': [None, True, False, 42, 1.25, float('nan'), float('inf'), float('-inf')],
    'date': datetime.date(2026, 9, 21),
    'timestamp': datetime.datetime(2026, 9, 21, 12, 30, 1, 123456, tzinfo=datetime.timezone.utc),
    'uuid': UUID('12345678-1234-5678-1234-567812345678'),
    'type': IntType(nullable=True),
    'path': CatalogPath.from_components(('sdk_test', 'docs'), version=None),
    'tuple': (1, 'two'),
}
wire = protocol.serialize_args(value, sink)
head = json.dumps(wire, separators=(',', ':'), ensure_ascii=False).encode()
output = {
    'protocol_version': protocol.PROTOCOL_VERSION,
    'schema_version': VERSION,
    'wire': wire,
    'frame': base64.b64encode(protocol.encode_body(head, sink.binary_parts)).decode(),
    'parts': [base64.b64encode(part).decode() for part in sink.binary_parts],
}
Path(__file__).with_name('fixtures').joinpath('proxy.json').write_text(json.dumps(output, indent=2) + '\n')


arrays = {}
for name, array in {
    'matrix': np.array([[1.5, -2], [0, 3.25]], dtype='<f4'),
    'fortran': np.asfortranarray(np.array([[1, 2], [3, 4]], dtype='<i2')),
    'big_endian': np.array([1, -2], dtype='>i4'),
    'int64': np.array([-(2**63), 2**63 - 1], dtype='<i8'),
    'uint64': np.array([0, 2**64 - 1], dtype='<u8'),
    'half': np.array([1.5, -2], dtype='<f2'),
    'tensor': np.asfortranarray(np.arange(24, dtype='>i4').reshape(2, 3, 4)),
    'bool': np.array([True, False], dtype='?'),
    'scalar': np.array(3.5, dtype='<f8'),
    'empty': np.empty((2, 0, 3), dtype='<u2'),
}.items():
    for version in [(1, 0), (2, 0), (3, 0)]:
        buffer = io.BytesIO()
        np.lib.format.write_array(buffer, array, version=version, allow_pickle=False)
        arrays[f'{name}_v{version[0]}'] = {
            'descr': array.dtype.str,
            'shape': list(array.shape),
            'fortranOrder': bool(array.flags.f_contiguous and not array.flags.c_contiguous),
            'data': base64.b64encode(array.tobytes(order='A')).decode(),
            'flat': [str(value) for value in array.flatten(order='C').tolist()],
            'npy': base64.b64encode(buffer.getvalue()).decode(),
        }
Path(__file__).with_name('fixtures').joinpath('catalog-npy.json').write_text(json.dumps(arrays, indent=2) + '\n')
