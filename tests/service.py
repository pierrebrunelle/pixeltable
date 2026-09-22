import argparse
import asyncio
import json
import os
from pathlib import Path
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

import fastapi
import uvicorn
from udf_fixture import parse_number

import pixeltable as pxt
from pixeltable.env import Env
import pixeltable.functions as pxtf
from pixeltable.serving import FastAPIRouter

parser = argparse.ArgumentParser()
parser.add_argument('--schema', type=Path)
parser.add_argument('--port', type=int, default=8765)
parser.add_argument('--catalog', action='store_true')
args = parser.parse_args()

if not os.environ.get('PIXELTABLE_HOME'):
    raise RuntimeError('Set PIXELTABLE_HOME to a temporary directory')
database_server = Env.get()._db_server
if database_server is not None:
    database_server.cleanup_mode = 'stop'

pxt.create_dir('sdk_test', if_exists='ignore')
docs = pxt.create_table(
    'sdk_test.docs',
    {'id': pxt.Int, 'title': pxt.String, 'image': pxt.Image | None},
    primary_key='id',
    if_exists='ignore',
)
docs.add_computed_column(title_upper=pxtf.string.upper(docs.title), if_exists='ignore')


@pxt.query
def lookup(id: int) -> pxt.Query:
    return docs.where(docs.id == id).select(docs.id, docs.title_upper)


router = FastAPIRouter(name='sdk-test')
router.add_query_route(path='/lookup', query=lookup, method='get')
router.add_query_route(path='/search', query=lookup, method='post')
router.add_insert_route(docs, path='/docs', inputs=['id', 'title'], outputs=['id', 'title_upper'])
router.add_compute_route(docs, path='/preview', inputs=['id', 'title'], outputs=['title_upper'])
router.add_compute_route(docs, path='/background', inputs=['id', 'title'], outputs=['title_upper'], background=True)
router.add_update_route(docs, path='/edit', inputs=['title'], outputs=['id', 'title_upper'])
router.add_delete_route(docs, path='/remove')
router.add_insert_route(
    docs, path='/upload', inputs=['id', 'title'], uploadfile_inputs=['image'], outputs=['id', 'title_upper']
)
errors = pxt.create_table('sdk_test.errors', {'text': pxt.String})
errors.add_computed_column(number=parse_number(errors.text))
errors.insert([{'text': '42'}, {'text': 'invalid'}], on_error='ignore')


@asynccontextmanager
async def lifespan(app: fastapi.FastAPI) -> AsyncIterator[None]:
    try:
        yield
    finally:
        Env.get().engine.dispose()
        if database_server is not None:
            await asyncio.to_thread(database_server.cleanup)


app = fastapi.FastAPI(lifespan=lifespan)
app.include_router(router)
if args.catalog:
    from pixeltable.service.proxy_daemon import _build_app

    app.mount('/catalog', _build_app())

if args.schema:
    args.schema.write_text(json.dumps(app.openapi(), indent=2) + '\n')
else:
    uvicorn.run(app, host='127.0.0.1', port=args.port)
