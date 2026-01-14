"""
Bridge layer between Pixeltable internal APIs and the Dashboard REST API.

This module translates Pixeltable's internal data structures into JSON-serializable
formats suitable for the dashboard frontend.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import pixeltable as pxt
from pixeltable.catalog import Catalog
from pixeltable.env import Env

_logger = logging.getLogger('pixeltable.dashboard')


@dataclass
class DirNode:
    """Represents a directory in the tree structure."""
    name: str
    path: str
    children: list['DirNode | TableNode']

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'path': self.path,
            'type': 'directory',
            'children': [c.to_dict() for c in self.children],
        }


@dataclass
class TableNode:
    """Represents a table/view/snapshot in the tree structure."""
    name: str
    path: str
    kind: str  # 'table', 'view', 'snapshot', 'replica'
    version: int | None

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'path': self.path,
            'type': self.kind,
            'version': self.version,
        }


def get_directory_tree() -> list[dict[str, Any]]:
    """
    Get the complete directory tree with all tables/views/snapshots.

    Returns:
        List of directory nodes with nested children.
    """
    # Get all directories
    all_dirs = pxt.list_dirs('', recursive=True)
    all_tables = pxt.list_tables('', recursive=True)

    # Build a tree structure
    root_children: list[dict[str, Any]] = []

    # Create a mapping of paths to their entries
    dir_nodes: dict[str, dict[str, Any]] = {}

    # First pass: create all directory nodes
    for dir_path in sorted(all_dirs):
        parts = dir_path.split('.')
        node = {
            'name': parts[-1],
            'path': dir_path,
            'type': 'directory',
            'children': [],
        }
        dir_nodes[dir_path] = node

        if len(parts) == 1:
            # Top-level directory
            root_children.append(node)
        else:
            # Child directory - add to parent
            parent_path = '.'.join(parts[:-1])
            if parent_path in dir_nodes:
                dir_nodes[parent_path]['children'].append(node)

    # Second pass: add tables to their directories
    for tbl_path in sorted(all_tables):
        parts = tbl_path.split('.')
        tbl_name = parts[-1]
        parent_path = '.'.join(parts[:-1]) if len(parts) > 1 else ''

        # Get table metadata
        try:
            tbl = pxt.get_table(tbl_path)
            md = tbl.get_metadata()
            kind = 'table'
            if md['is_replica']:
                kind = 'replica'
            elif md['is_snapshot']:
                kind = 'snapshot'
            elif md['is_view']:
                kind = 'view'
            version = md['version'] if kind != 'snapshot' else None
        except Exception as e:
            _logger.warning(f'Failed to get metadata for {tbl_path}: {e}')
            kind = 'table'
            version = None

        table_node = {
            'name': tbl_name,
            'path': tbl_path,
            'type': kind,
            'version': version,
        }

        if parent_path and parent_path in dir_nodes:
            dir_nodes[parent_path]['children'].append(table_node)
        elif not parent_path:
            root_children.append(table_node)

    return root_children


def get_directory_contents(dir_path: str) -> dict[str, Any]:
    """
    Get the contents of a specific directory.

    Args:
        dir_path: Path to the directory (empty string for root)

    Returns:
        Dictionary with 'dirs' and 'tables' lists.
    """
    contents = pxt.get_dir_contents(dir_path, recursive=False)

    result = {
        'path': dir_path,
        'dirs': [],
        'tables': [],
    }

    for d in contents['dirs']:
        result['dirs'].append({
            'name': d.split('.')[-1],
            'path': d,
        })

    for t in contents['tables']:
        try:
            tbl = pxt.get_table(t)
            md = tbl.get_metadata()
            kind = 'table'
            if md['is_replica']:
                kind = 'replica'
            elif md['is_snapshot']:
                kind = 'snapshot'
            elif md['is_view']:
                kind = 'view'
            result['tables'].append({
                'name': t.split('.')[-1],
                'path': t,
                'type': kind,
                'version': md['version'] if kind != 'snapshot' else None,
            })
        except Exception as e:
            _logger.warning(f'Failed to get metadata for {t}: {e}')
            result['tables'].append({
                'name': t.split('.')[-1],
                'path': t,
                'type': 'table',
                'version': None,
            })

    return result


def get_table_metadata(table_path: str) -> dict[str, Any]:
    """
    Get detailed metadata for a table including schema, indices, and lineage info.

    Args:
        table_path: Full path to the table

    Returns:
        Dictionary with table metadata.
    """
    tbl = pxt.get_table(table_path)
    md = tbl.get_metadata()

    # Determine table kind
    kind = 'table'
    if md['is_replica']:
        kind = 'replica'
    elif md['is_snapshot']:
        kind = 'snapshot'
    elif md['is_view']:
        kind = 'view'

    # Build column information
    columns = []
    for col_name, col_info in md['columns'].items():
        columns.append({
            'name': col_info.get('name', col_name),
            'type': col_info.get('type_', 'Unknown'),
            'is_computed': col_info.get('computed_with') is not None,
            'computed_with': col_info.get('computed_with'),
            'is_stored': col_info.get('is_stored', True),
            'is_primary_key': col_info.get('is_primary_key', False),
            'defined_in': col_info.get('defined_in'),
            'version_added': col_info.get('version_added', 0),
        })

    # Build index information
    indices = []
    for idx_name, idx_info in md['indices'].items():
        # Handle both 'columns' (array) and 'column' (string) formats
        columns = idx_info.get('columns', [])
        column_str = ', '.join(columns) if columns else idx_info.get('column', '')
        indices.append({
            'name': idx_info.get('name', idx_name),
            'column': column_str,
            'type_': idx_info.get('index_type', idx_info.get('type_', 'Unknown')),
            'parameters': idx_info.get('parameters', {}),
        })

    return {
        'path': md['path'],
        'name': md['name'],
        'type': kind,
        'version': md['version'],
        'schema_version': md['schema_version'],
        'created_at': md['version_created'].isoformat() if md['version_created'] else None,
        'comment': md['comment'],
        'base': md['base'],
        'columns': columns,
        'indices': indices,
        'media_validation': md['media_validation'],
    }


def get_table_data(
    table_path: str,
    offset: int = 0,
    limit: int = 50,
    order_by: str | None = None,
    order_desc: bool = False,
) -> dict[str, Any]:
    """
    Get paginated data from a table with media URLs resolved.

    Args:
        table_path: Full path to the table
        offset: Number of rows to skip
        limit: Maximum number of rows to return
        order_by: Column name to order by (optional)
        order_desc: Whether to order descending

    Returns:
        Dictionary with 'rows', 'total_count', and 'columns' information.
    """
    tbl = pxt.get_table(table_path)
    md = tbl.get_metadata()

    # Get the HTTP server address for media URLs
    http_address = Env.get()._http_address

    # Build column info and select expressions
    columns = []
    select_dict = {}
    media_url_cols = {}  # Maps original col name to fileurl col name
    
    for col_name, col_info in md['columns'].items():
        col_type = col_info.get('type_', 'Unknown')
        is_media = any(t in col_type.lower() for t in ['image', 'video', 'audio', 'document'])
        columns.append({
            'name': col_name,
            'type': col_type,
            'is_media': is_media,
        })
        
        col_ref = getattr(tbl, col_name)
        
        if is_media:
            # For media columns, get both the value and the fileurl
            select_dict[col_name] = col_ref
            fileurl_col_name = f'{col_name}__url'
            select_dict[fileurl_col_name] = col_ref.fileurl
            media_url_cols[col_name] = fileurl_col_name
        else:
            select_dict[col_name] = col_ref

    # Build query with named columns
    query = tbl.select(**select_dict)

    if order_by and hasattr(tbl, order_by):
        col = getattr(tbl, order_by)
        query = query.order_by(col, asc=not order_desc)

    # Get total count
    total_count = tbl.count()

    # Get paginated data - collect returns a list, so we need to handle pagination manually
    results = list(query.collect())

    # Apply pagination manually
    paginated_results = results[offset:offset + limit] if offset < len(results) else []

    # Transform results to JSON-serializable format
    rows = []
    for row in paginated_results:
        row_data = {}
        for col_info in columns:
            col_name = col_info['name']
            value = row.get(col_name)

            # Handle media types - use the fileurl we selected
            if col_info['is_media']:
                fileurl_col = media_url_cols.get(col_name)
                fileurl = row.get(fileurl_col) if fileurl_col else None
                
                if fileurl:
                    # If it's a file:// URL, convert to HTTP URL
                    if fileurl.startswith('file://'):
                        import urllib.parse
                        import urllib.request
                        # Extract path from file:// URL
                        parsed = urllib.parse.urlparse(fileurl)
                        local_path = urllib.parse.unquote(urllib.request.url2pathname(parsed.path))
                        row_data[col_name] = f'{http_address}{local_path}'
                    else:
                        # Already an HTTP/S3/etc URL
                        row_data[col_name] = fileurl
                else:
                    row_data[col_name] = None
            elif hasattr(value, 'isoformat'):
                # Handle datetime
                row_data[col_name] = value.isoformat()
            elif isinstance(value, (list, dict)):
                row_data[col_name] = value
            elif value is not None:
                # Try to make it JSON serializable
                try:
                    row_data[col_name] = value if isinstance(value, (int, float, bool, str)) else str(value)
                except Exception:
                    row_data[col_name] = str(value)
            else:
                row_data[col_name] = None

        rows.append(row_data)

    return {
        'columns': columns,
        'rows': rows,
        'total_count': total_count,
        'offset': offset,
        'limit': limit,
    }


def get_column_lineage(table_path: str) -> dict[str, Any]:
    """
    Get the column dependency graph for a table.

    Returns a graph structure showing how computed columns depend on other columns.

    Args:
        table_path: Full path to the table

    Returns:
        Dictionary with 'nodes' and 'edges' for the lineage graph.
    """
    tbl = pxt.get_table(table_path)
    md = tbl.get_metadata()

    nodes = []
    edges = []

    # Build nodes for each column
    for col_name, col_info in md['columns'].items():
        node_id = f'{table_path}.{col_name}'
        is_computed = col_info.get('computed_with') is not None
        defined_in = col_info.get('defined_in') or md['name']

        nodes.append({
            'id': node_id,
            'name': col_name,
            'table': table_path,
            'type': col_info.get('type_', 'Unknown'),
            'is_computed': is_computed,
            'computed_with': col_info.get('computed_with'),
            'defined_in': defined_in,
            'is_external': defined_in != md['name'],
        })

        # Parse computed_with expression to find dependencies
        if is_computed and col_info.get('computed_with'):
            expr = col_info['computed_with']
            # Simple parsing: look for column references in the expression
            # This is a basic implementation - could be enhanced with proper expression parsing
            for other_col_name in md['columns'].keys():
                if other_col_name != col_name and other_col_name in expr:
                    edges.append({
                        'source': f'{table_path}.{other_col_name}',
                        'target': node_id,
                    })

    # Also check for cross-table dependencies if this is a view
    if md['base']:
        try:
            base_tbl = pxt.get_table(md['base'])
            base_md = base_tbl.get_metadata()

            for col_name, col_info in md['columns'].items():
                col_defined_in = col_info.get('defined_in')
                if col_defined_in and col_defined_in != md['name']:
                    # This column comes from a base table
                    source_id = f'{col_defined_in}.{col_name}'
                    target_id = f'{table_path}.{col_name}'

                    # Add the base table column as a node if not already present
                    if not any(n['id'] == source_id for n in nodes):
                        nodes.append({
                            'id': source_id,
                            'name': col_name,
                            'table': col_defined_in,
                            'type': col_info.get('type_', 'Unknown'),
                            'is_computed': False,
                            'computed_with': None,
                            'defined_in': col_defined_in,
                            'is_external': True,
                        })

                    edges.append({
                        'source': source_id,
                        'target': target_id,
                    })
        except Exception as e:
            _logger.warning(f'Failed to get base table metadata for lineage: {e}')

    return {
        'table': table_path,
        'nodes': nodes,
        'edges': edges,
    }


def get_information_schema() -> dict[str, Any]:
    """
    Get the complete information schema across all tables.
    
    Returns:
        Dictionary with comprehensive schema information:
        - tables: List of all tables with their metadata
        - columns: List of all columns across all tables
        - indices: List of all indices
        - computed_columns: List of computed columns with expressions
        - summary: Overall statistics
    """
    all_tables = pxt.list_tables('', recursive=True)
    
    tables = []
    columns = []
    indices = []
    computed_columns = []
    
    total_rows = 0
    total_columns = 0
    total_indices = 0
    total_computed = 0
    
    for tbl_path in all_tables:
        try:
            tbl = pxt.get_table(tbl_path)
            md = tbl.get_metadata()
            
            # Determine table kind
            kind = 'table'
            if md['is_replica']:
                kind = 'replica'
            elif md['is_snapshot']:
                kind = 'snapshot'
            elif md['is_view']:
                kind = 'view'
            
            # Get row count
            try:
                row_count = tbl.count()
            except Exception:
                row_count = 0
            
            total_rows += row_count
            
            # Add table info
            tables.append({
                'path': tbl_path,
                'name': md['name'],
                'type': kind,
                'version': md['version'],
                'schema_version': md['schema_version'],
                'row_count': row_count,
                'column_count': len(md['columns']),
                'index_count': len(md['indices']),
                'base': md['base'],
                'created_at': md['version_created'].isoformat() if md['version_created'] else None,
            })
            
            # Add columns
            for col_name, col_info in md['columns'].items():
                total_columns += 1
                is_computed = col_info.get('computed_with') is not None
                
                col_data = {
                    'table_path': tbl_path,
                    'table_name': md['name'],
                    'column_name': col_name,
                    'data_type': col_info.get('type_', 'Unknown'),
                    'is_stored': col_info.get('is_stored', True),
                    'is_primary_key': col_info.get('is_primary_key', False),
                    'is_computed': is_computed,
                    'defined_in': col_info.get('defined_in'),
                    'version_added': col_info.get('version_added', 0),
                }
                columns.append(col_data)
                
                if is_computed:
                    total_computed += 1
                    computed_columns.append({
                        **col_data,
                        'expression': col_info.get('computed_with'),
                    })
            
            # Add indices
            for idx_name, idx_info in md['indices'].items():
                total_indices += 1
                # Handle both 'columns' (array) and 'column' (string) formats
                columns = idx_info.get('columns', [])
                column_str = ', '.join(columns) if columns else idx_info.get('column', '')
                indices.append({
                    'table_path': tbl_path,
                    'table_name': md['name'],
                    'index_name': idx_info.get('name', idx_name),
                    'column': column_str,
                    'index_type': idx_info.get('index_type', idx_info.get('type_', 'Unknown')),
                    'parameters': idx_info.get('parameters', {}),
                })
                
        except Exception as e:
            _logger.warning(f'Failed to get metadata for {tbl_path}: {e}')
            continue
    
    # Get directory count
    all_dirs = pxt.list_dirs('', recursive=True)
    
    return {
        'tables': tables,
        'columns': columns,
        'indices': indices,
        'computed_columns': computed_columns,
        'summary': {
            'total_directories': len(all_dirs),
            'total_tables': len(tables),
            'total_rows': total_rows,
            'total_columns': total_columns,
            'total_indices': total_indices,
            'total_computed_columns': total_computed,
        },
    }


def search(query: str, limit: int = 50) -> dict[str, Any]:
    """
    Search across directories, tables, and columns.

    Args:
        query: Search query string
        limit: Maximum number of results per category

    Returns:
        Dictionary with 'directories', 'tables', and 'columns' results.
    """
    query_lower = query.lower()

    results = {
        'query': query,
        'directories': [],
        'tables': [],
        'columns': [],
    }

    # Search directories
    all_dirs = pxt.list_dirs('', recursive=True)
    for dir_path in all_dirs:
        if query_lower in dir_path.lower():
            results['directories'].append({
                'path': dir_path,
                'name': dir_path.split('.')[-1],
            })
            if len(results['directories']) >= limit:
                break

    # Search tables and their columns
    all_tables = pxt.list_tables('', recursive=True)
    for tbl_path in all_tables:
        tbl_name = tbl_path.split('.')[-1]

        # Check if table name matches
        table_matches = query_lower in tbl_path.lower()

        if table_matches and len(results['tables']) < limit:
            try:
                tbl = pxt.get_table(tbl_path)
                md = tbl.get_metadata()
                kind = 'table'
                if md['is_replica']:
                    kind = 'replica'
                elif md['is_snapshot']:
                    kind = 'snapshot'
                elif md['is_view']:
                    kind = 'view'

                results['tables'].append({
                    'path': tbl_path,
                    'name': tbl_name,
                    'type': kind,
                })
            except Exception:
                results['tables'].append({
                    'path': tbl_path,
                    'name': tbl_name,
                    'type': 'table',
                })

        # Search columns within this table
        if len(results['columns']) < limit:
            try:
                tbl = pxt.get_table(tbl_path)
                md = tbl.get_metadata()
                for col_name, col_info in md['columns'].items():
                    if query_lower in col_name.lower():
                        results['columns'].append({
                            'name': col_name,
                            'table': tbl_path,
                            'type': col_info.get('type_', 'Unknown'),
                            'is_computed': col_info.get('computed_with') is not None,
                        })
                        if len(results['columns']) >= limit:
                            break
            except Exception:
                pass

    return results
