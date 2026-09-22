"""Generate binary protocol fixtures without opening a Pixeltable database."""

import base64
import datetime
import json
from pathlib import Path
from uuid import UUID

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
