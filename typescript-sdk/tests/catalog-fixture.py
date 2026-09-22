"""Generate scalar table metadata in an explicitly selected temporary Pixeltable home."""

import json
import os
from pathlib import Path

import pixeltable as pxt
from pixeltable.runtime import get_runtime
from pixeltable.service import proxy_protocol

if not os.environ.get('PIXELTABLE_HOME'):
    raise RuntimeError('Set PIXELTABLE_HOME to a new temporary directory')

pxt.create_dir('inspect')
table = pxt.create_table(
    'inspect/docs', {'id': pxt.Int, 'title': pxt.String, 'score': pxt.Float | None}, primary_key='id'
)
catalog = get_runtime().catalog
with catalog.begin_xact(for_write=False):
    metadata = catalog.read_md_for_export(table)
head, parts = proxy_protocol.decode_body(proxy_protocol.encode_response({'result': (metadata, True)}))
assert not parts
response = json.loads(head)
value = response['result']['v'][0][0]['v']
for field in ('tbl_md', 'version_md', 'schema_version_md'):
    value[field]['tbl_id'] = '12345678-1234-5678-1234-567812345678'
value['version_md']['created_at'] = 0
Path(__file__).with_name('fixtures').joinpath('catalog-table.json').write_text(json.dumps(response, indent=2) + '\n')
