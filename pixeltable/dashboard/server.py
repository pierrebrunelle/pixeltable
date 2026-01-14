"""
aiohttp server for the Pixeltable Dashboard.

This module provides the web server that serves:
1. Static frontend assets (React SPA)
2. REST API endpoints for Pixeltable data access
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from aiohttp import web

from pixeltable.dashboard.routes import create_routes

_logger = logging.getLogger('pixeltable.dashboard')

# Path to the built frontend assets
DASHBOARD_DIST_PATH = Path(__file__).parent.parent.parent / 'dashboard' / 'dist'


def create_app() -> web.Application:
    """Create and configure the aiohttp application."""
    app = web.Application()

    # Add CORS middleware
    @web.middleware
    async def cors_middleware(request: web.Request, handler):
        if request.method == 'OPTIONS':
            return web.Response(
                status=200,
                headers={
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            )
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response

    app.middlewares.append(cors_middleware)

    # Add API routes
    app.router.add_routes(create_routes())

    # Serve static files from the dashboard dist directory
    if DASHBOARD_DIST_PATH.exists():
        # Serve index.html for the root path
        async def serve_index(request: web.Request) -> web.Response:
            index_path = DASHBOARD_DIST_PATH / 'index.html'
            if index_path.exists():
                return web.FileResponse(index_path)
            return web.Response(text='Dashboard not found', status=404)

        # Serve static assets
        app.router.add_static('/assets', DASHBOARD_DIST_PATH / 'assets', name='assets')

        # Serve index.html for all non-API routes (SPA routing)
        app.router.add_get('/', serve_index)
        app.router.add_get('/{path:(?!api/).*}', serve_index)

        _logger.info(f'Serving dashboard from {DASHBOARD_DIST_PATH}')
    else:
        # Development mode - serve a placeholder
        async def dev_placeholder(request: web.Request) -> web.Response:
            return web.Response(
                text='''
<!DOCTYPE html>
<html>
<head>
    <title>Pixeltable Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e0e0e0;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            color: #00d4ff;
        }
        p {
            font-size: 1.1rem;
            line-height: 1.6;
            max-width: 500px;
        }
        .api-link {
            display: inline-block;
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: #00d4ff;
            color: #1a1a2e;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .api-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
        }
        code {
            background: rgba(255,255,255,0.1);
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Pixeltable Dashboard</h1>
        <p>
            The dashboard frontend is not built yet. 
            To build it, run:
        </p>
        <p><code>cd dashboard && npm install && npm run build</code></p>
        <p style="margin-top: 1.5rem;">
            The API is available for testing:
        </p>
        <a href="/api/dirs" class="api-link">View API: /api/dirs</a>
    </div>
</body>
</html>
                ''',
                content_type='text/html',
            )

        app.router.add_get('/', dev_placeholder)
        app.router.add_get('/{path:(?!api/).*}', dev_placeholder)

        _logger.warning(f'Dashboard dist not found at {DASHBOARD_DIST_PATH}, serving placeholder')

    return app


def run_server(host: str = '0.0.0.0', port: int = 8080) -> None:
    """
    Run the dashboard server.

    Args:
        host: Host address to bind to
        port: Port number to listen on
    """
    # Ensure Pixeltable is initialized
    import pixeltable as pxt
    pxt.init()

    app = create_app()

    print(f'\n  Pixeltable Dashboard running at http://localhost:{port}\n')
    print('  API Endpoints:')
    print('    GET /api/dirs           - Directory tree')
    print('    GET /api/tables/{path}  - Table metadata')
    print('    GET /api/tables/{path}/data    - Table data')
    print('    GET /api/tables/{path}/lineage - Column lineage')
    print('    GET /api/search?q=      - Search')
    print()

    web.run_app(app, host=host, port=port, print=None)
