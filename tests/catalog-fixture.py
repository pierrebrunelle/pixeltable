"""Generate scalar table metadata in an explicitly selected temporary Pixeltable home."""

import datetime
import json
import os
import uuid
from pathlib import Path

import numpy as np

from udf_fixture import array_total, decorate, text_embedding

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

array_literal = array_total(values=np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32))
Path(__file__).with_name('fixtures').joinpath('catalog-array-literal.json').write_text(
    json.dumps(array_literal.as_dict(), indent=2) + '\n'
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


temporal = pxt.create_table('inspect/temporal', {'day': pxt.Date, 'at': pxt.Timestamp})
day = datetime.date(2026, 9, 22)
at = datetime.datetime(2026, 9, 22, 12, 30, 1, 123456, tzinfo=datetime.timezone.utc)
expressions = {
    'date_compare': temporal.day >= day,
    'timestamp_compare': temporal.at < at,
    'date_membership': temporal.day.isin([day]),
    'timestamp_membership': temporal.at.isin([at]),
}
serialized = json.dumps(
    proxy_protocol.serialize_args(
        {name: expr.as_dict() for name, expr in expressions.items()}, proxy_protocol.InlinePartSink()
    )
).replace(str(temporal._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-temporal.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


left = pxt.create_table('inspect/join_left', {'key': pxt.Int, 'label': pxt.String})
right = pxt.create_table('inspect/join_right', {'key': pxt.Int, 'amount': pxt.Int})
left.insert([{'key': 1, 'label': 'one'}, {'key': 2, 'label': 'two'}])
right.insert([{'key': 2, 'amount': 20}, {'key': 3, 'amount': 30}])
join_cases = {}
for how in ('inner', 'left', 'full_outer', 'cross'):
    joined = left.join(right, how=how, on=None if how == 'cross' else left.key == right.key).select(
        left_key=left.key, label=left.label, right_key=right.key, amount=right.amount
    )
    results = joined.collect()
    join_cases[how] = {
        'query': joined.as_dict(),
        'schema': {name: col_type.as_dict() for name, col_type in joined.schema.items()},
        'rows': sorted(results, key=lambda row: (row['left_key'] or 0, row['right_key'] or 0)),
    }
with catalog.begin_xact(for_write=False):
    source_metadata = {side: catalog.read_md_for_export(source) for side, source in [('left', left), ('right', right)]}
join_cases['sources'] = proxy_protocol.serialize_args(source_metadata, proxy_protocol.InlinePartSink())
for entries in join_cases['sources'].values():
    for entry in entries:
        entry['v']['version_md']['created_at'] = 0
serialized = (
    json.dumps(join_cases)
    .replace(str(left._id), '12345678-1234-5678-1234-567812345678')
    .replace(str(right._id), '23456789-2345-6789-2345-678923456789')
)
Path(__file__).with_name('fixtures').joinpath('catalog-joins.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


distinct = table.where(table.id > 0).select(title=table.title, adjusted=table.score + 1).distinct()
serialized = json.dumps(distinct.as_dict()).replace(str(table._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-distinct.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


uuid_table = pxt.create_table('inspect/uuid_values', {'value': pxt.UUID})
identifier = uuid.UUID('ABCDEF01-2345-6789-ABCD-EF0123456789')
uuid_expressions = {
    'equality': (uuid_table.value == identifier).as_dict(),
    'ordering': (uuid_table.value < identifier).as_dict(),
    'membership': uuid_table.value.isin([identifier]).as_dict(),
}
serialized = json.dumps(proxy_protocol.serialize_args(uuid_expressions, proxy_protocol.InlinePartSink())).replace(
    str(uuid_table._id), '12345678-1234-5678-1234-567812345678'
)
Path(__file__).with_name('fixtures').joinpath('catalog-uuid.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)


matrix = pxt.create_table('inspect/matrix', {'value': pxt.Array[(3, 4), pxt.Float]})
slices = {
    'element': matrix.value[-1, 2],
    'row': matrix.value[-1],
    'column': matrix.value[::-1, 1],
    'row_slice': matrix.value[0, 1::2],
    'reverse': matrix.value[::-1, 1::2],
    'empty': matrix.value[2:1],
    'clamped': matrix.value[-100:100:2, ::-1],
    'negative_stop': matrix.value[:-1:-1],
}
serialized = json.dumps(
    {name: {'expression': expr.as_dict(), 'type': expr.col_type.as_dict()} for name, expr in slices.items()}
).replace(str(matrix._id), '12345678-1234-5678-1234-567812345678')
Path(__file__).with_name('fixtures').joinpath('catalog-array-slice.json').write_text(
    json.dumps(json.loads(serialized), indent=2) + '\n'
)
