import { useApi } from '@/hooks/useApi';
import { getTableMetadata } from '@/api/client';
import type { TableMetadata, ColumnInfo } from '@/types';
import {
  KeyIcon,
  CpuChipIcon,
  CircleStackIcon,
  ArrowPathIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface TableSchemaProps {
  tablePath: string;
}

function ColumnTypeTag({ type }: { type: string }) {
  // Parse and colorize the type
  const typeLower = (type || '').toLowerCase();
  const isMedia = ['image', 'video', 'audio', 'document'].some((t) =>
    typeLower.includes(t)
  );
  const isArray = typeLower.includes('array');
  const isJson = typeLower.includes('json');

  let bgColor = 'bg-accent';
  let textColor = 'text-foreground';

  if (isMedia) {
    bgColor = 'bg-purple-500/20';
    textColor = 'text-purple-400';
  } else if (isArray) {
    bgColor = 'bg-kandinsky-blue-light/20';
    textColor = 'text-kandinsky-blue-light';
  } else if (isJson) {
    bgColor = 'bg-green-500/20';
    textColor = 'text-green-400';
  }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${bgColor} ${textColor}`}>
      {type}
    </span>
  );
}

function ColumnRow({ column, tableName }: { column: ColumnInfo; tableName: string }) {
  const isInherited = column.defined_in && column.defined_in !== tableName;

  return (
    <tr className="border-b border-border/50 hover:bg-accent/50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {column.is_primary_key && (
            <KeyIcon className="w-4 h-4 text-kandinsky-yellow" title="Primary Key" />
          )}
          {column.is_computed && (
            <CpuChipIcon className="w-4 h-4 text-primary" title="Computed Column" />
          )}
          {column.is_stored && !column.is_computed && (
            <CircleStackIcon className="w-4 h-4 text-muted-foreground" title="Stored Column" />
          )}
          <span className={`font-medium ${isInherited ? 'text-muted-foreground' : 'text-foreground'}`}>
            {column.name}
          </span>
          {isInherited && (
            <span className="text-xs text-muted-foreground" title={`Defined in ${column.defined_in}`}>
              (from {column.defined_in})
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <ColumnTypeTag type={column.type} />
      </td>
      <td className="py-3 px-4 text-sm">
        {column.is_computed ? (
          <div className="group relative">
            <code className="text-xs bg-background px-2 py-1 rounded text-primary font-mono max-w-xs truncate block">
              {column.computed_with}
            </code>
            {column.computed_with && column.computed_with.length > 50 && (
              <div className="absolute z-10 hidden group-hover:block bg-card border border-border rounded-lg p-3 shadow-xl max-w-lg top-full left-0 mt-1">
                <code className="text-xs text-primary font-mono whitespace-pre-wrap break-all">
                  {column.computed_with}
                </code>
              </div>
            )}
          </div>
        ) : column.is_stored ? (
          <span className="text-muted-foreground text-xs">Stored</span>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        )}
      </td>
      <td className="py-3 px-4 text-xs text-muted-foreground">
        v{column.version_added}
      </td>
    </tr>
  );
}

function TableHeader({ metadata }: { metadata: TableMetadata }) {
  const typeColors = {
    table: 'bg-kandinsky-blue-light/20 text-kandinsky-blue-light border border-kandinsky-blue-light/30',
    view: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    snapshot: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    replica: 'bg-kandinsky-gray/20 text-kandinsky-gray border border-kandinsky-gray/30',
  };

  return (
    <div className="p-6 border-b border-border bg-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-foreground">{metadata.name}</h2>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[metadata.type]}`}>
              {metadata.type}
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{metadata.path}</p>
          {metadata.comment && (
            <p className="mt-2 text-sm text-muted-foreground">{metadata.comment}</p>
          )}
        </div>
        <div className="text-right text-sm">
          <div className="text-muted-foreground">
            Version <span className="text-foreground font-medium">{metadata.version}</span>
          </div>
          {metadata.created_at && (
            <div className="text-muted-foreground text-xs mt-1">
              {new Date(metadata.created_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      {/* Base table info for views/snapshots */}
      {metadata.base && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowPathIcon className="w-4 h-4" />
          <span>Based on:</span>
          <code className="bg-background px-2 py-0.5 rounded text-primary text-xs">
            {metadata.base}
          </code>
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-6 mt-4 text-sm">
        <div>
          <span className="text-muted-foreground">Columns:</span>{' '}
          <span className="text-foreground font-medium">{metadata.columns.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Indices:</span>{' '}
          <span className="text-foreground font-medium">{metadata.indices.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Schema Version:</span>{' '}
          <span className="text-foreground font-medium">{metadata.schema_version}</span>
        </div>
      </div>
    </div>
  );
}

function IndicesSection({ indices }: { indices: TableMetadata['indices'] }) {
  if (indices.length === 0) return null;

  return (
    <div className="p-6 border-b border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <InformationCircleIcon className="w-5 h-5 text-primary" />
        Indices
      </h3>
      <div className="space-y-2">
        {indices.map((idx) => (
          <div
            key={idx.name}
            className="flex items-center gap-4 px-3 py-2 bg-card rounded-lg text-sm"
          >
            <span className="font-medium text-foreground">{idx.name}</span>
            <span className="text-muted-foreground">on</span>
            <code className="bg-background px-2 py-0.5 rounded text-primary text-xs">
              {idx.column}
            </code>
            <span className="px-2 py-0.5 bg-accent rounded text-xs text-muted-foreground">
              {idx.type_}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSchema({ tablePath }: TableSchemaProps) {
  const { data: metadata, loading, error } = useApi<TableMetadata>(
    () => getTableMetadata(tablePath),
    [tablePath]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-kandinsky-red">
        <p className="text-lg font-medium">Error loading table</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (!metadata) return null;

  return (
    <div className="h-full overflow-auto">
      <TableHeader metadata={metadata} />

      {/* Indices section */}
      <IndicesSection indices={metadata.indices} />

      {/* Columns table */}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Columns</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="py-2 px-4 font-medium">Name</th>
                <th className="py-2 px-4 font-medium">Type</th>
                <th className="py-2 px-4 font-medium">Expression</th>
                <th className="py-2 px-4 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {metadata.columns.map((col) => (
                <ColumnRow key={col.name} column={col} tableName={metadata.name} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
