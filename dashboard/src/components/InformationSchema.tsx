import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TableCellsIcon,
  CircleStackIcon,
  CubeIcon,
  VariableIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useApi } from '../hooks/useApi';
import type { InformationSchema as InformationSchemaType } from '../types';

type TabId = 'overview' | 'tables' | 'columns' | 'indices' | 'computed';

export function InformationSchema() {
  const { data: schema, loading, error } = useApi<InformationSchemaType>('/api/schema');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const toggleTableExpand = (tablePath: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tablePath)) {
        next.delete(tablePath);
      } else {
        next.add(tablePath);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading schema...</div>
      </div>
    );
  }

  if (error || !schema) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-kandinsky-red">Error loading schema: {error}</div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'overview', label: 'Overview', count: 0 },
    { id: 'tables', label: 'Tables', count: schema.summary.total_tables },
    { id: 'columns', label: 'Columns', count: schema.summary.total_columns },
    { id: 'indices', label: 'Indices', count: schema.summary.total_indices },
    { id: 'computed', label: 'Computed', count: schema.summary.total_computed_columns },
  ];

  // Filter based on search
  const filterBySearch = <T extends { table_name?: string; table_path?: string; column_name?: string; name?: string; path?: string }>(
    items: T[]
  ): T[] => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item => 
      (item.table_name?.toLowerCase().includes(q)) ||
      (item.table_path?.toLowerCase().includes(q)) ||
      (item.column_name?.toLowerCase().includes(q)) ||
      (item.name?.toLowerCase().includes(q)) ||
      (item.path?.toLowerCase().includes(q))
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">
            Information Schema
          </h1>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-64"
            />
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 text-xs opacity-70">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && (
          <OverviewTab schema={schema} />
        )}
        {activeTab === 'tables' && (
          <TablesTab 
            tables={filterBySearch(schema.tables)} 
            columns={schema.columns}
            expandedTables={expandedTables}
            toggleTableExpand={toggleTableExpand}
            onTableClick={(path) => navigate(`/table/${path}`)}
          />
        )}
        {activeTab === 'columns' && (
          <ColumnsTab 
            columns={filterBySearch(schema.columns)}
            onTableClick={(path) => navigate(`/table/${path}`)}
          />
        )}
        {activeTab === 'indices' && (
          <IndicesTab 
            indices={filterBySearch(schema.indices)}
            onTableClick={(path) => navigate(`/table/${path}`)}
          />
        )}
        {activeTab === 'computed' && (
          <ComputedTab 
            computed={filterBySearch(schema.computed_columns)}
            onTableClick={(path) => navigate(`/table/${path}`)}
          />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ schema }: { schema: InformationSchemaType }) {
  const stats = [
    { label: 'Directories', value: schema.summary.total_directories, icon: CircleStackIcon, color: 'text-kandinsky-yellow' },
    { label: 'Tables', value: schema.summary.total_tables, icon: TableCellsIcon, color: 'text-kandinsky-blue-light' },
    { label: 'Total Rows', value: schema.summary.total_rows.toLocaleString(), icon: CubeIcon, color: 'text-green-400' },
    { label: 'Columns', value: schema.summary.total_columns, icon: VariableIcon, color: 'text-purple-400' },
    { label: 'Indices', value: schema.summary.total_indices, icon: MagnifyingGlassIcon, color: 'text-kandinsky-blue-light' },
    { label: 'Computed Columns', value: schema.summary.total_computed_columns, icon: VariableIcon, color: 'text-kandinsky-red' },
  ];

  // Group tables by type
  const tablesByType = schema.tables.reduce((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Top tables by row count
  const topTables = [...schema.tables]
    .sort((a, b) => b.row_count - a.row_count)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-card rounded-xl p-4 border border-border">
            <stat.icon className={`w-6 h-6 ${stat.color} mb-2`} />
            <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            <div className="text-sm text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tables by type */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Tables by Type</h3>
        <div className="flex gap-6 flex-wrap">
          {Object.entries(tablesByType).map(([type, count]) => (
            <div key={type} className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                type === 'table' ? 'bg-kandinsky-blue-light/20 text-kandinsky-blue-light' :
                type === 'view' ? 'bg-purple-500/20 text-purple-400' :
                type === 'snapshot' ? 'bg-kandinsky-red/20 text-kandinsky-red' :
                'bg-muted text-muted-foreground'
              }`}>
                {type}
              </span>
              <span className="text-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top tables */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Largest Tables</h3>
        <div className="space-y-3">
          {topTables.map(table => (
            <div key={table.path} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TableCellsIcon className="w-4 h-4 text-kandinsky-blue-light" />
                <span className="text-foreground text-sm">{table.path}</span>
              </div>
              <span className="text-muted-foreground text-sm">
                {table.row_count.toLocaleString()} rows
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TablesTab({ 
  tables, 
  columns,
  expandedTables,
  toggleTableExpand,
  onTableClick 
}: { 
  tables: InformationSchemaType['tables'];
  columns: InformationSchemaType['columns'];
  expandedTables: Set<string>;
  toggleTableExpand: (path: string) => void;
  onTableClick: (path: string) => void;
}) {
  return (
    <div className="space-y-2">
      {tables.map(table => {
        const isExpanded = expandedTables.has(table.path);
        const tableColumns = columns.filter(c => c.table_path === table.path);
        
        return (
          <div key={table.path} className="bg-card rounded-lg border border-border overflow-hidden">
            <div 
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/50"
              onClick={() => toggleTableExpand(table.path)}
            >
              {isExpanded ? (
                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
              )}
              <TableCellsIcon className="w-5 h-5 text-kandinsky-blue-light" />
              <span 
                className="text-foreground hover:text-primary cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onTableClick(table.path); }}
              >
                {table.path}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                table.type === 'table' ? 'bg-kandinsky-blue-light/20 text-kandinsky-blue-light' :
                table.type === 'view' ? 'bg-purple-500/20 text-purple-400' :
                'bg-muted text-muted-foreground'
              }`}>
                {table.type}
              </span>
              <span className="ml-auto text-sm text-muted-foreground">
                {table.row_count.toLocaleString()} rows · {table.column_count} columns · {table.index_count} indices
              </span>
            </div>
            
            {isExpanded && (
              <div className="border-t border-border p-4 bg-background">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-2 pr-4">Column</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableColumns.map(col => (
                      <tr key={col.column_name} className="border-t border-border/50">
                        <td className="py-2 pr-4 text-foreground">{col.column_name}</td>
                        <td className="py-2 pr-4">
                          <span className="px-2 py-0.5 bg-accent rounded text-xs text-primary">
                            {col.data_type}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {col.is_primary_key && <span className="mr-2">🔑 PK</span>}
                          {col.is_computed && <span className="mr-2">⚙️ Computed</span>}
                          {!col.is_stored && <span className="mr-2">💾 Not Stored</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ColumnsTab({ 
  columns,
  onTableClick 
}: { 
  columns: InformationSchemaType['columns'];
  onTableClick: (path: string) => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-background">
          <tr className="text-muted-foreground text-left">
            <th className="p-4">Table</th>
            <th className="p-4">Column</th>
            <th className="p-4">Type</th>
            <th className="p-4">Properties</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => (
            <tr key={`${col.table_path}.${col.column_name}.${i}`} className="border-t border-border/50 hover:bg-accent/30">
              <td className="p-4">
                <span 
                  className="text-primary hover:underline cursor-pointer"
                  onClick={() => onTableClick(col.table_path)}
                >
                  {col.table_path}
                </span>
              </td>
              <td className="p-4 text-foreground">{col.column_name}</td>
              <td className="p-4">
                <span className="px-2 py-0.5 bg-accent rounded text-xs text-primary">
                  {col.data_type}
                </span>
              </td>
              <td className="p-4 text-muted-foreground">
                {col.is_primary_key && <span className="mr-2 text-kandinsky-yellow">PK</span>}
                {col.is_computed && <span className="mr-2 text-purple-400">Computed</span>}
                {!col.is_stored && <span className="mr-2 text-kandinsky-red">Virtual</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndicesTab({ 
  indices,
  onTableClick 
}: { 
  indices: InformationSchemaType['indices'];
  onTableClick: (path: string) => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-background">
          <tr className="text-muted-foreground text-left">
            <th className="p-4">Table</th>
            <th className="p-4">Index Name</th>
            <th className="p-4">Column</th>
            <th className="p-4">Type</th>
          </tr>
        </thead>
        <tbody>
          {indices.map((idx, i) => (
            <tr key={`${idx.table_path}.${idx.index_name}.${i}`} className="border-t border-border/50 hover:bg-accent/30">
              <td className="p-4">
                <span 
                  className="text-primary hover:underline cursor-pointer"
                  onClick={() => onTableClick(idx.table_path)}
                >
                  {idx.table_path}
                </span>
              </td>
              <td className="p-4 text-foreground">{idx.index_name}</td>
              <td className="p-4 text-foreground">{idx.column}</td>
              <td className="p-4">
                <span className="px-2 py-0.5 bg-kandinsky-blue-light/20 rounded text-xs text-kandinsky-blue-light">
                  {idx.index_type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComputedTab({ 
  computed,
  onTableClick 
}: { 
  computed: InformationSchemaType['computed_columns'];
  onTableClick: (path: string) => void;
}) {
  return (
    <div className="space-y-4">
      {computed.map((col, i) => (
        <div key={`${col.table_path}.${col.column_name}.${i}`} className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <VariableIcon className="w-5 h-5 text-purple-400" />
            <span 
              className="text-primary hover:underline cursor-pointer"
              onClick={() => onTableClick(col.table_path)}
            >
              {col.table_path}
            </span>
            <span className="text-muted-foreground">.</span>
            <span className="text-foreground">{col.column_name}</span>
            <span className="px-2 py-0.5 bg-accent rounded text-xs text-primary ml-2">
              {col.data_type}
            </span>
          </div>
          {col.expression && (
            <div className="bg-background rounded-lg p-3 text-sm text-foreground overflow-x-auto">
              <pre>{col.expression}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
