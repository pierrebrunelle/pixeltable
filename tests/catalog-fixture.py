"""Generate scalar table metadata in an explicitly selected temporary Pixeltable home."""

import json
import os
from pathlib import Path

from udf_fixture import decorate, text_embedding

import pixeltable as pxt
from pixeltable.env import Env
from pixeltable.functions import count, max, mean, min, sum
from pixeltable.runtime import get_runtime
from pixeltable.service import proxy_protocol

if not os.environ.get('PIXELTABLE_HOME'):
    raise RuntimeError('Set PIXELTABLE_HOME to a new temporary directory')

database_server = Env.get()._db_server
if database_server is not None:
    database_server.cleanup_mode = 'stop'

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

query = (
    table.where((table.id > 1) & ((table.score == None) | (table.title != 'skip')))
    .select(table.id, table.title)
    .order_by(table.id, asc=False)
    .limit(2, offset=1)
)
serialized = json.dumps(query.as_dict()).replace(str(table._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-query.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)

expressions = {
    'add': table.id + 2,
    'subtract': table.id - 2,
    'multiply': table.id * 2,
    'divide': table.id / 2,
    'modulo': table.id % 2,
    'floorDivide': table.id // 2,
    'pow': table.id**2,
}
serialized = json.dumps({name: expr.as_dict() for name, expr in expressions.items()}).replace(
    str(table._id), '12345678-1234-5678-1234-567812345678'
)
Path(__file__).with_name('fixtures').joinpath('catalog-arithmetic.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)

expressions = {'multiply': table.id * table.score, 'power': table.id**table.id, 'compare': table.id > table.score}
serialized = json.dumps({name: expr.as_dict() for name, expr in expressions.items()}).replace(
    str(table._id), '12345678-1234-5678-1234-567812345678'
)
Path(__file__).with_name('fixtures').joinpath('catalog-column-expressions.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)

view = pxt.create_view('inspect/filtered', table.where(table.id > 1))
serialized = (
    json.dumps(view.select(view.id, view.title, view.score).as_dict())
    .replace(str(table._id), '12345678-1234-5678-1234-567812345678')
    .replace(str(view._id), '23456789-2345-6789-2345-678923456789')
)
Path(__file__).with_name('fixtures').joinpath('catalog-view-query.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)

serialized = json.dumps(table.select(item=table.id, new_score=table.score * 2).as_dict()).replace(
    str(table._id), '12345678-1234-5678-1234-567812345678'
)
Path(__file__).with_name('fixtures').joinpath('catalog-projection.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)

serialized = json.dumps(decorate(text=table.title, prefix='Hi ').as_dict()).replace(
    str(table._id), '12345678-1234-5678-1234-567812345678'
)
Path(__file__).with_name('fixtures').joinpath('catalog-function.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


table.add_embedding_index('title', embedding=text_embedding, idx_name='text_idx', precision='fp32')
similarity = table.title.similarity(string='aaa', idx='text_idx')
serialized = json.dumps(
    table.select(title=table.title, score=similarity).order_by(similarity, asc=False).limit(2).as_dict()
).replace(str(table._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-similarity.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


table.add_computed_column(double_id=table.id * 2)
serialized = json.dumps(
    table.select(error_type=table.double_id.errortype, error_message=table.double_id.errormsg).as_dict()
).replace(str(table._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-errors.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


snapshot = pxt.create_snapshot('inspect/frozen', table.where(table.id > 0))
serialized = (
    json.dumps(snapshot.select(snapshot.id).as_dict())
    .replace(str(table._id), '12345678-1234-5678-1234-567812345678')
    .replace(str(snapshot._id), '34567890-3456-7890-3456-789034567890')
)
Path(__file__).with_name('fixtures').joinpath('catalog-snapshot.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


expressions = {
    'integers': table.id.isin([1, 2]),
    'empty': table.title.isin([]),
    'nullable': table.score.isin([1.5, None]),
}
serialized = json.dumps({name: expression.as_dict() for name, expression in expressions.items()}).replace(
    str(table._id), '12345678-1234-5678-1234-567812345678'
)
Path(__file__).with_name('fixtures').joinpath('catalog-membership.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


json_table = pxt.create_table('inspect/json_paths', {'payload': pxt.Json, 'required': pxt.Int})
expressions = {
    'nested': json_table.payload['items'][0]['name'],
    'wildcard': json_table.payload['items']['*']['name'],
    'slice': json_table.payload['items'][::-1]['name'],
    'cast': json_table.payload['score'].astype(pxt.Float | None),
    'required_cast': json_table.required.astype(pxt.Float | None),
}
serialized = json.dumps({name: expression.as_dict() for name, expression in expressions.items()}).replace(
    str(json_table._id), '12345678-1234-5678-1234-567812345678'
)
Path(__file__).with_name('fixtures').joinpath('catalog-json-path.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


aggregated = (
    table.group_by(table.title)
    .select(
        title=table.title,
        total=sum(table.score),
        average=mean(table.score),
        minimum=min(table.score),
        maximum=max(table.score),
        present=count(table.score),
    )
    .order_by(table.title)
)
serialized = json.dumps(aggregated.as_dict()).replace(str(table._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-aggregate.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


window_query = table.select(
    id=table.id,
    running=sum(table.score, group_by=table.title, order_by=table.id),
    seen=count(table.score, order_by=table.id),
    minimum=min(table.score, group_by=table.title),
    maximum=max(table.score, group_by=table.title, order_by=table.id),
)
serialized = json.dumps(window_query.as_dict()).replace(str(table._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-window.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)
