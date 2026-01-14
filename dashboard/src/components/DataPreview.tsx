import { useState, useEffect, useMemo } from 'react';
import { getTableData } from '@/api/client';
import type { TableData, DataColumn } from '@/types';
import {
  ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon,
  PhotoIcon, FilmIcon, MusicalNoteIcon, DocumentIcon,
  Squares2X2Icon, TableCellsIcon, FunnelIcon, XMarkIcon,
  CheckIcon, ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

type ViewMode = 'table' | 'gallery';
type MediaType = 'image' | 'video' | 'audio' | 'document';
type FilterValue = string | number | boolean | null;
type Filters = Record<string, FilterValue[]>;

// Utility to detect media type from column
const getMediaType = (colType: string): MediaType => {
  const t = (colType || '').toLowerCase();
  if (t.includes('image')) return 'image';
  if (t.includes('video')) return 'video';
  if (t.includes('audio')) return 'audio';
  return 'document';
};

// Compact Media Preview with expand modal
function MediaPreview({ url, type }: { url: string; type: MediaType }) {
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (error || !url) {
    const Icon = { image: PhotoIcon, video: FilmIcon, audio: MusicalNoteIcon, document: DocumentIcon }[type];
    return <div className="flex items-center gap-1 text-muted-foreground text-xs"><Icon className="w-4 h-4" /><span className="truncate max-w-24">{url?.split('/').pop() || 'N/A'}</span></div>;
  }

  const Modal = ({ children }: { children: React.ReactNode }) => expanded && (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={() => setExpanded(false)}>
      <button onClick={() => setExpanded(false)} className="absolute top-4 right-4 text-white hover:text-primary"><XMarkIcon className="w-8 h-8" /></button>
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );

  if (type === 'image') return (
    <>
      <img src={url} alt="" className="max-h-16 max-w-32 rounded cursor-pointer hover:ring-2 ring-primary object-cover" onError={() => setError(true)} onClick={() => setExpanded(true)} />
      <Modal><img src={url} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg" /></Modal>
    </>
  );

  if (type === 'video') return (
    <>
      <div className="relative group cursor-pointer" onClick={() => setExpanded(true)}>
        <video src={url} className="max-h-16 max-w-32 rounded object-cover hover:ring-2 ring-primary" muted preload="metadata" onError={() => setError(true)} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 bg-primary/90 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-foreground ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
      <Modal><video src={url} controls autoPlay className="max-h-[85vh] max-w-[90vw] rounded-lg" /></Modal>
    </>
  );

  if (type === 'audio') return <audio controls className="h-8 w-32"><source src={url} /></audio>;

  return <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><DocumentIcon className="w-4 h-4" /><span className="truncate max-w-24">{url.split('/').pop()}</span></a>;
}

// Compact Cell Renderer
function Cell({ value, column }: { value: unknown; column: DataColumn }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground italic text-xs">null</span>;
  if (column.is_media && typeof value === 'string') return <MediaPreview url={value} type={getMediaType(column.type)} />;
  if (typeof value === 'object') return <pre className="text-xs bg-background px-2 py-1 rounded max-w-xs overflow-auto max-h-20">{JSON.stringify(value, null, 2)}</pre>;
  if (typeof value === 'boolean') return <span className={`text-xs font-medium ${value ? 'text-green-400' : 'text-kandinsky-red'}`}>{String(value)}</span>;
  if (typeof value === 'number') return <span className="font-mono text-sm text-primary">{value.toLocaleString()}</span>;
  const str = String(value);
  return <span className="text-sm" title={str.length > 100 ? str : undefined}>{str.length > 100 ? str.slice(0, 100) + '...' : str}</span>;
}

// Gallery Card for media items
function GalleryCard({ row, columns, mediaCol, selected, onSelect, onClick }: {
  row: Record<string, unknown>; columns: DataColumn[]; mediaCol: DataColumn;
  selected: boolean; onSelect: () => void; onClick: () => void;
}) {
  const url = row[mediaCol.name] as string | null;
  const type = getMediaType(mediaCol.type);
  const otherCols = columns.filter(c => c.name !== mediaCol.name).slice(0, 3);

  return (
    <div className={`relative group bg-card rounded-lg border overflow-hidden transition-all ${selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}`}>
      {/* Selection checkbox */}
      <button onClick={e => { e.stopPropagation(); onSelect(); }} className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border flex items-center justify-center transition-all ${selected ? 'bg-primary border-primary' : 'bg-background/80 border-border opacity-0 group-hover:opacity-100'}`}>
        {selected && <CheckIcon className="w-3 h-3 text-primary-foreground" />}
      </button>
      {/* Media */}
      <div className="aspect-square bg-background cursor-pointer" onClick={onClick}>
        {url ? (
          type === 'image' ? <img src={url} alt="" className="w-full h-full object-cover" /> :
          type === 'video' ? <video src={url} className="w-full h-full object-cover" muted preload="metadata" /> :
          <div className="w-full h-full flex items-center justify-center text-muted-foreground"><DocumentIcon className="w-12 h-12" /></div>
        ) : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><PhotoIcon className="w-12 h-12" /></div>}
      </div>
      {/* Metadata overlay */}
      <div className="p-2 text-xs space-y-0.5">
        {otherCols.map(c => (
          <div key={c.name} className="flex justify-between gap-2 truncate">
            <span className="text-muted-foreground">{c.name}:</span>
            <span className="truncate text-foreground">{row[c.name] != null ? String(row[c.name]).slice(0, 20) : 'null'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Filter Panel Sidebar
function FilterPanel({ columns, data, filters, onChange, onClose }: {
  columns: DataColumn[]; data: TableData; filters: Filters;
  onChange: (f: Filters) => void; onClose: () => void;
}) {
  // Extract unique values for each non-media column
  const filterableColumns = useMemo(() => 
    columns.filter(c => !c.is_media && !c.type.toLowerCase().includes('json')).slice(0, 5),
    [columns]
  );
  
  const uniqueValues = useMemo(() => {
    const vals: Record<string, Set<FilterValue>> = {};
    filterableColumns.forEach(c => vals[c.name] = new Set());
    data.rows.forEach(row => {
      filterableColumns.forEach(c => {
        const v = row[c.name];
        if (v !== null && v !== undefined && typeof v !== 'object') vals[c.name].add(v as FilterValue);
      });
    });
    return Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, [...v].slice(0, 10)]));
  }, [data.rows, filterableColumns]);

  const toggleFilter = (col: string, val: FilterValue) => {
    const current = filters[col] || [];
    const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
    onChange({ ...filters, [col]: next });
  };

  return (
    <div className="w-64 border-l border-border bg-card p-4 flex flex-col gap-4 overflow-auto">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Filters</span>
        <button onClick={onClose} className="p-1 hover:bg-accent rounded"><XMarkIcon className="w-4 h-4" /></button>
      </div>
      {filterableColumns.map(col => (
        <div key={col.name} className="space-y-1">
          <div className="text-xs text-muted-foreground font-medium">{col.name}</div>
          <div className="flex flex-wrap gap-1">
            {uniqueValues[col.name]?.map(val => {
              const isActive = (filters[col.name] || []).includes(val);
              return (
                <button key={String(val)} onClick={() => toggleFilter(col.name, val)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}>
                  {String(val).slice(0, 15)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {Object.keys(filters).some(k => filters[k]?.length) && (
        <button onClick={() => onChange({})} className="text-xs text-muted-foreground hover:text-foreground">Clear all filters</button>
      )}
    </div>
  );
}

// Main Component
export function DataPreview({ tablePath }: { tablePath: string }) {
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [orderDesc, setOrderDesc] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const pageSize = viewMode === 'gallery' ? 24 : 50;

  // Fetch data
  useEffect(() => {
    setLoading(true);
    setError(null);
    getTableData(tablePath, { offset: page * pageSize, limit: pageSize, orderBy: orderBy || undefined, orderDesc })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [tablePath, page, pageSize, orderBy, orderDesc]);

  // Reset on table change
  useEffect(() => { setPage(0); setSelected(new Set()); setFilters({}); }, [tablePath]);

  // Detect if table is media-heavy
  const mediaColumn = useMemo(() => data?.columns.find(c => c.is_media), [data]);
  const isMediaHeavy = useMemo(() => data && data.columns.filter(c => c.is_media).length > 0, [data]);

  // Apply client-side filters
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter(row => 
      Object.entries(filters).every(([col, vals]) => !vals?.length || vals.includes(row[col] as FilterValue))
    );
  }, [data, filters]);

  const handleSort = (col: string) => {
    if (orderBy === col) { orderDesc ? (setOrderBy(null), setOrderDesc(false)) : setOrderDesc(true); }
    else { setOrderBy(col); setOrderDesc(false); }
    setPage(0);
  };

  const toggleSelect = (idx: number) => {
    const next = new Set(selected);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(filteredRows.map((_, i) => i)));
  const clearSelection = () => setSelected(new Set());

  const exportSelected = () => {
    const rows = [...selected].map(i => filteredRows[i]).filter(Boolean);
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tablePath.replace(/\./g, '_')}_export.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading && !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="flex flex-col items-center justify-center h-64 text-kandinsky-red"><p className="text-lg font-medium">Error loading data</p><p className="text-sm text-muted-foreground mt-1">{error}</p></div>;
  if (!data) return null;

  const totalPages = Math.ceil(data.total_count / pageSize);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card gap-4 flex-shrink-0">
          {/* Left: selection info or row count */}
          <div className="text-sm text-muted-foreground">
            {selected.size > 0 ? (
              <span className="text-primary font-medium">{selected.size} selected</span>
            ) : (
              <>Showing <span className="text-foreground font-medium">{Math.min(filteredRows.length, pageSize)}</span> of <span className="text-foreground font-medium">{data.total_count.toLocaleString()}</span></>
            )}
          </div>

          {/* Center: actions */}
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <button onClick={exportSelected} className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90">
                  <ArrowDownTrayIcon className="w-3 h-3" />Export
                </button>
                <button onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                <div className="w-px h-4 bg-border" />
              </>
            )}
            {selected.size === 0 && filteredRows.length > 0 && (
              <button onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground">Select all</button>
            )}
          </div>

          {/* Right: view controls */}
          <div className="flex items-center gap-2">
            {isMediaHeavy && (
              <div className="flex bg-accent rounded p-0.5">
                <button onClick={() => setViewMode('table')} className={`p-1 rounded ${viewMode === 'table' ? 'bg-background shadow-sm' : ''}`} title="Table view">
                  <TableCellsIcon className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode('gallery')} className={`p-1 rounded ${viewMode === 'gallery' ? 'bg-background shadow-sm' : ''}`} title="Gallery view">
                  <Squares2X2Icon className="w-4 h-4" />
                </button>
              </div>
            )}
            <button onClick={() => setShowFilters(!showFilters)} className={`p-1.5 rounded ${showFilters ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`} title="Filters">
              <FunnelIcon className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border" />
            {/* Pagination */}
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-accent disabled:opacity-50"><ChevronLeftIcon className="w-4 h-4" /></button>
            <span className="text-xs text-muted-foreground">{page + 1}/{totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-accent disabled:opacity-50"><ChevronRightIcon className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto relative">
          {viewMode === 'gallery' && mediaColumn ? (
            // Gallery View
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4">
              {filteredRows.slice(0, pageSize).map((row, idx) => (
                <GalleryCard key={idx} row={row} columns={data.columns} mediaCol={mediaColumn}
                  selected={selected.has(idx)} onSelect={() => toggleSelect(idx)} onClick={() => setExpandedRow(idx)} />
              ))}
            </div>
          ) : (
            // Table View
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr>
                  <th className="w-10 px-2 py-3 border-b border-border">
                    <input type="checkbox" checked={selected.size === filteredRows.length && filteredRows.length > 0}
                      onChange={e => e.target.checked ? selectAll() : clearSelection()}
                      className="rounded border-border" />
                  </th>
                  {data.columns.map(col => (
                    <th key={col.name} onClick={() => handleSort(col.name)}
                      className="text-left px-4 py-3 border-b border-border text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground group">
                      <div className="flex items-center gap-1">
                        {col.name}
                        {orderBy === col.name && (orderDesc ? <ChevronDownIcon className="w-3 h-3 text-primary" /> : <ChevronUpIcon className="w-3 h-3 text-primary" />)}
                        {col.is_media && <PhotoIcon className="w-3 h-3 text-purple-400 ml-1" />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, pageSize).map((row, idx) => (
                  <tr key={idx} className={`border-b border-border/50 hover:bg-accent/30 ${selected.has(idx) ? 'bg-primary/10' : ''}`}>
                    <td className="px-2 py-3">
                      <input type="checkbox" checked={selected.has(idx)} onChange={() => toggleSelect(idx)} className="rounded border-border" />
                    </td>
                    {data.columns.map(col => (
                      <td key={col.name} className="px-4 py-3 align-top"><Cell value={row[col.name]} column={col} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filteredRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-lg">No data</p>
              <p className="text-sm mt-1">{Object.keys(filters).length ? 'No rows match filters' : 'This table is empty'}</p>
            </div>
          )}

          {loading && <div className="absolute inset-0 bg-background/50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && <FilterPanel columns={data.columns} data={data} filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />}

      {/* Expanded Row Modal (for gallery) */}
      {expandedRow !== null && filteredRows[expandedRow] && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8" onClick={() => setExpandedRow(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-primary"><XMarkIcon className="w-8 h-8" /></button>
          <div className="bg-card rounded-lg max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="grid md:grid-cols-2 gap-4 p-4">
              {mediaColumn && filteredRows[expandedRow][mediaColumn.name] != null && (
                <div className="aspect-square bg-background rounded overflow-hidden">
                  {getMediaType(mediaColumn.type) === 'image' ? (
                    <img src={filteredRows[expandedRow][mediaColumn.name] as string} alt="" className="w-full h-full object-contain" />
                  ) : getMediaType(mediaColumn.type) === 'video' ? (
                    <video src={filteredRows[expandedRow][mediaColumn.name] as string} controls className="w-full h-full object-contain" />
                  ) : null}
                </div>
              )}
              <div className="space-y-2">
                {data.columns.filter(c => c.name !== mediaColumn?.name).map(col => (
                  <div key={col.name} className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{col.name}</span>
                    <Cell value={filteredRows[expandedRow][col.name]} column={col} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
