"""
REST API route handlers for the Pixeltable Dashboard.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from aiohttp import web

from pixeltable.dashboard import bridge

_logger = logging.getLogger('pixeltable.dashboard')


def create_routes() -> list[web.RouteDef]:
    """Create and return all API route definitions."""
    return [
        web.get('/api/dirs', handle_get_dirs),
        web.get('/api/dirs/{path:.*}/contents', handle_get_dir_contents),
        web.get('/api/tables/{path:.*}/data', handle_get_table_data),
        web.get('/api/tables/{path:.*}/lineage', handle_get_table_lineage),
        web.get('/api/tables/{path:.*}', handle_get_table),
        web.get('/api/schema', handle_get_schema),
        web.get('/api/search', handle_search),
        web.get('/api/health', handle_health),
    ]


def json_response(data: Any, status: int = 200) -> web.Response:
    """Create a JSON response with CORS headers."""
    return web.Response(
        text=json.dumps(data, default=str),
        status=status,
        content_type='application/json',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    )


def error_response(message: str, status: int = 500) -> web.Response:
    """Create an error JSON response."""
    return json_response({'error': message}, status=status)


async def handle_health(request: web.Request) -> web.Response:
    """Health check endpoint."""
    return json_response({'status': 'ok'})


async def handle_get_dirs(request: web.Request) -> web.Response:
    """
    Get the complete directory tree.

    GET /api/dirs

    Returns:
        JSON array of directory/table nodes with nested children.
    """
    try:
        tree = bridge.get_directory_tree()
        return json_response(tree)
    except Exception as e:
        _logger.exception('Error getting directory tree')
        return error_response(str(e))


async def handle_get_dir_contents(request: web.Request) -> web.Response:
    """
    Get contents of a specific directory.

    GET /api/dirs/{path}/contents

    Path parameters:
        path: Directory path (use empty string for root)

    Returns:
        JSON object with 'dirs' and 'tables' lists.
    """
    try:
        path = request.match_info.get('path', '')
        contents = bridge.get_directory_contents(path)
        return json_response(contents)
    except Exception as e:
        _logger.exception(f'Error getting directory contents for {path}')
        return error_response(str(e))


async def handle_get_table(request: web.Request) -> web.Response:
    """
    Get table metadata including schema and indices.

    GET /api/tables/{path}

    Path parameters:
        path: Full table path (e.g., 'my_dir.my_table')

    Returns:
        JSON object with table metadata.
    """
    try:
        path = request.match_info.get('path', '')
        if not path:
            return error_response('Table path is required', status=400)

        metadata = bridge.get_table_metadata(path)
        return json_response(metadata)
    except Exception as e:
        _logger.exception(f'Error getting table metadata for {path}')
        return error_response(str(e))


async def handle_get_table_data(request: web.Request) -> web.Response:
    """
    Get paginated table data.

    GET /api/tables/{path}/data

    Path parameters:
        path: Full table path

    Query parameters:
        offset: Number of rows to skip (default: 0)
        limit: Maximum rows to return (default: 50)
        order_by: Column name to order by (optional)
        order_desc: 'true' for descending order (default: 'false')

    Returns:
        JSON object with 'columns', 'rows', 'total_count', etc.
    """
    try:
        path = request.match_info.get('path', '')
        if not path:
            return error_response('Table path is required', status=400)

        # Parse query parameters
        offset = int(request.query.get('offset', '0'))
        limit = min(int(request.query.get('limit', '50')), 500)  # Cap at 500
        order_by = request.query.get('order_by')
        order_desc = request.query.get('order_desc', 'false').lower() == 'true'

        data = bridge.get_table_data(
            path,
            offset=offset,
            limit=limit,
            order_by=order_by,
            order_desc=order_desc,
        )
        return json_response(data)
    except Exception as e:
        _logger.exception(f'Error getting table data for {path}')
        return error_response(str(e))


async def handle_get_table_lineage(request: web.Request) -> web.Response:
    """
    Get column lineage graph for a table.

    GET /api/tables/{path}/lineage

    Path parameters:
        path: Full table path

    Returns:
        JSON object with 'nodes' and 'edges' for the lineage graph.
    """
    try:
        path = request.match_info.get('path', '')
        if not path:
            return error_response('Table path is required', status=400)

        lineage = bridge.get_column_lineage(path)
        return json_response(lineage)
    except Exception as e:
        _logger.exception(f'Error getting table lineage for {path}')
        return error_response(str(e))


async def handle_get_schema(request: web.Request) -> web.Response:
    """
    Get the complete information schema.

    GET /api/schema

    Returns:
        JSON object with comprehensive schema information including:
        - tables: All tables with metadata
        - columns: All columns across all tables
        - indices: All indices
        - computed_columns: All computed columns with expressions
        - summary: Overall statistics
    """
    try:
        schema = bridge.get_information_schema()
        return json_response(schema)
    except Exception as e:
        _logger.exception('Error getting information schema')
        return error_response(str(e))


async def handle_search(request: web.Request) -> web.Response:
    """
    Search across directories, tables, and columns.

    GET /api/search

    Query parameters:
        q: Search query string
        limit: Maximum results per category (default: 50)

    Returns:
        JSON object with 'directories', 'tables', and 'columns' results.
    """
    try:
        query = request.query.get('q', '')
        if not query:
            return json_response({
                'query': '',
                'directories': [],
                'tables': [],
                'columns': [],
            })

        limit = min(int(request.query.get('limit', '50')), 100)
        results = bridge.search(query, limit=limit)
        return json_response(results)
    except Exception as e:
        _logger.exception(f'Error searching for {query}')
        return error_response(str(e))
