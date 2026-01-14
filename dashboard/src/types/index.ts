// API response types

export interface TreeNode {
  name: string;
  path: string;
  type: 'directory' | 'table' | 'view' | 'snapshot' | 'replica';
  version?: number | null;
  children?: TreeNode[];
}

export interface DirectoryContents {
  path: string;
  dirs: { name: string; path: string }[];
  tables: {
    name: string;
    path: string;
    type: string;
    version: number | null;
  }[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  is_computed: boolean;
  computed_with: string | null;
  is_stored: boolean;
  is_primary_key: boolean;
  defined_in: string | null;
  version_added: number;
}

export interface IndexInfo {
  name: string;
  column: string;
  type_: string;
  parameters: Record<string, unknown>;
}

export interface TableMetadata {
  path: string;
  name: string;
  type: 'table' | 'view' | 'snapshot' | 'replica';
  version: number;
  schema_version: number;
  created_at: string | null;
  comment: string | null;
  base: string | null;
  columns: ColumnInfo[];
  indices: IndexInfo[];
  media_validation: string;
}

export interface DataColumn {
  name: string;
  type: string;
  is_media: boolean;
}

export interface TableData {
  columns: DataColumn[];
  rows: Record<string, unknown>[];
  total_count: number;
  offset: number;
  limit: number;
}

export interface LineageNode {
  id: string;
  name: string;
  table: string;
  type: string;
  is_computed: boolean;
  computed_with: string | null;
  defined_in: string;
  is_external: boolean;
}

export interface LineageEdge {
  source: string;
  target: string;
}

export interface LineageGraph {
  table: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface SearchResults {
  query: string;
  directories: { path: string; name: string }[];
  tables: { path: string; name: string; type: string }[];
  columns: { name: string; table: string; type: string; is_computed: boolean }[];
}

// Information Schema types
export interface SchemaTableInfo {
  path: string;
  name: string;
  type: string;
  version: number;
  schema_version: number;
  row_count: number;
  column_count: number;
  index_count: number;
  base: string | null;
  created_at: string | null;
}

export interface SchemaColumnInfo {
  table_path: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_stored: boolean;
  is_primary_key: boolean;
  is_computed: boolean;
  defined_in: string | null;
  version_added: number;
}

export interface SchemaIndexInfo {
  table_path: string;
  table_name: string;
  index_name: string;
  column: string;
  index_type: string;
  parameters: Record<string, unknown>;
}

export interface SchemaComputedColumn extends SchemaColumnInfo {
  expression: string | null;
}

export interface InformationSchema {
  tables: SchemaTableInfo[];
  columns: SchemaColumnInfo[];
  indices: SchemaIndexInfo[];
  computed_columns: SchemaComputedColumn[];
  summary: {
    total_directories: number;
    total_tables: number;
    total_rows: number;
    total_columns: number;
    total_indices: number;
    total_computed_columns: number;
  };
}
