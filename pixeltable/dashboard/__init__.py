"""
Pixeltable Dashboard - Local Web UI for exploring Pixeltable data.

Usage:
    import pixeltable as pxt
    pxt.dashboard.serve()  # Opens browser to http://localhost:8080
"""
from __future__ import annotations

import logging
import webbrowser
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

_logger = logging.getLogger('pixeltable.dashboard')


def serve(port: int = 8080, open_browser: bool = True) -> None:
    """
    Start the Pixeltable dashboard UI server.

    Args:
        port: Port number to serve the dashboard on (default: 8080)
        open_browser: Whether to automatically open the browser (default: True)

    Example:
        >>> import pixeltable as pxt
        >>> pxt.dashboard.serve()  # Opens browser to http://localhost:8080
    """
    from pixeltable.dashboard.server import run_server

    url = f'http://localhost:{port}'
    _logger.info(f'Starting Pixeltable Dashboard at {url}')

    # Print Ray-style dashboard message
    print(f'\n  Pixeltable Dashboard running at {url}\n')
    print('  API Endpoints:')
    print('    GET /api/dirs           - Directory tree')
    print('    GET /api/tables/{path}  - Table metadata')
    print('    GET /api/tables/{path}/data    - Table data')
    print('    GET /api/tables/{path}/lineage - Column lineage')
    print('    GET /api/schema         - Information schema')
    print('    GET /api/search?q=      - Search\n')

    if open_browser:
        webbrowser.open(url)

    run_server(port=port)
