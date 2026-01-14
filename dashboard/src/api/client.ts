import type {
  TreeNode,
  DirectoryContents,
  TableMetadata,
  TableData,
  LineageGraph,
  SearchResults,
  InformationSchema,
} from '@/types';

const API_BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function getDirectoryTree(): Promise<TreeNode[]> {
  return fetchJson<TreeNode[]>(`${API_BASE}/dirs`);
}

export async function getDirectoryContents(path: string): Promise<DirectoryContents> {
  return fetchJson<DirectoryContents>(`${API_BASE}/dirs/${encodeURIComponent(path)}/contents`);
}

export async function getTableMetadata(path: string): Promise<TableMetadata> {
  return fetchJson<TableMetadata>(`${API_BASE}/tables/${encodeURIComponent(path)}`);
}

export async function getTableData(
  path: string,
  options: {
    offset?: number;
    limit?: number;
    orderBy?: string;
    orderDesc?: boolean;
  } = {}
): Promise<TableData> {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.orderBy) params.set('order_by', options.orderBy);
  if (options.orderDesc) params.set('order_desc', 'true');

  const query = params.toString();
  return fetchJson<TableData>(`${API_BASE}/tables/${encodeURIComponent(path)}/data${query ? `?${query}` : ''}`);
}

export async function getTableLineage(path: string): Promise<LineageGraph> {
  return fetchJson<LineageGraph>(`${API_BASE}/tables/${encodeURIComponent(path)}/lineage`);
}

export async function search(query: string, limit = 50): Promise<SearchResults> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return fetchJson<SearchResults>(`${API_BASE}/search?${params}`);
}

export async function healthCheck(): Promise<{ status: string }> {
  return fetchJson<{ status: string }>(`${API_BASE}/health`);
}

export async function getInformationSchema(): Promise<InformationSchema> {
  return fetchJson<InformationSchema>(`${API_BASE}/schema`);
}
