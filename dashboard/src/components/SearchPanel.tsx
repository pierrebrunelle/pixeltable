import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { search } from '@/api/client';
import { useDebounce } from '@/hooks/useApi';
import type { SearchResults } from '@/types';
import {
  MagnifyingGlassIcon,
  FolderIcon,
  TableCellsIcon,
  EyeIcon,
  CameraIcon,
  DocumentDuplicateIcon,
  HashtagIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string, type: string) => void;
}

type ResultType = 'directory' | 'table' | 'column';

interface SearchResultItem {
  type: ResultType;
  name: string;
  path: string;
  subtype?: string;
  extra?: string;
}

function getResultIcon(item: SearchResultItem) {
  if (item.type === 'directory') {
    return <FolderIcon className="w-4 h-4 text-kandinsky-yellow" />;
  }
  if (item.type === 'column') {
    return <HashtagIcon className="w-4 h-4 text-primary" />;
  }
  // Table types
  switch (item.subtype) {
    case 'view':
      return <EyeIcon className="w-4 h-4 text-purple-400" />;
    case 'snapshot':
      return <CameraIcon className="w-4 h-4 text-kandinsky-red" />;
    case 'replica':
      return <DocumentDuplicateIcon className="w-4 h-4 text-kandinsky-gray" />;
    default:
      return <TableCellsIcon className="w-4 h-4 text-kandinsky-blue-light" />;
  }
}

function ResultItem({
  item,
  isSelected,
  onClick,
}: {
  item: SearchResultItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected
          ? 'bg-primary/20 text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
      onClick={onClick}
    >
      {getResultIcon(item)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.name}</span>
          {item.subtype && item.type === 'table' && item.subtype !== 'table' && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                item.subtype === 'view'
                  ? 'bg-purple-500/20 text-purple-400'
                  : item.subtype === 'snapshot'
                  ? 'bg-kandinsky-red/20 text-kandinsky-red'
                  : 'bg-kandinsky-gray/20 text-kandinsky-gray'
              }`}
            >
              {item.subtype}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {item.type === 'column' ? (
            <>
              in <span className="text-primary">{item.path}</span>
              {item.extra && <span className="ml-2">({item.extra})</span>}
            </>
          ) : (
            item.path
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground capitalize">{item.type}</div>
    </button>
  );
}

export function SearchPanel({ isOpen, onClose, onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 200);

  // Flatten results for keyboard navigation
  const flattenedResults: SearchResultItem[] = results
    ? [
        ...results.directories.map((d) => ({
          type: 'directory' as const,
          name: d.name,
          path: d.path,
        })),
        ...results.tables.map((t) => ({
          type: 'table' as const,
          name: t.name,
          path: t.path,
          subtype: t.type,
        })),
        ...results.columns.map((c) => ({
          type: 'column' as const,
          name: c.name,
          path: c.table,
          extra: c.type,
        })),
      ]
    : [];

  // Search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      return;
    }

    setLoading(true);
    search(debouncedQuery)
      .then(setResults)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flattenedResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flattenedResults[selectedIndex]) {
          const item = flattenedResults[selectedIndex];
          onSelect(item.path, item.type === 'column' ? 'table' : item.type);
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  const handleItemClick = (item: SearchResultItem) => {
    onSelect(item.path, item.type === 'column' ? 'table' : item.type);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="fixed inset-0 flex items-start justify-center pt-[15vh]">
        <DialogPanel className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <MagnifyingGlassIcon className="w-5 h-5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search directories, tables, columns..."
              className="flex-1 bg-transparent text-foreground placeholder-muted-foreground outline-none text-lg"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
            <kbd className="text-xs bg-background px-2 py-1 rounded text-muted-foreground border border-border">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && query && flattenedResults.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <p>No results found for "{query}"</p>
              </div>
            )}

            {!loading && flattenedResults.length > 0 && (
              <div className="py-2">
                {/* Group: Directories */}
                {results && results.directories.length > 0 && (
                  <div>
                    <div className="px-4 py-1 text-xs font-medium text-muted-foreground uppercase">
                      Directories
                    </div>
                    {results.directories.map((d, idx) => (
                      <ResultItem
                        key={`dir-${d.path}`}
                        item={{ type: 'directory', name: d.name, path: d.path }}
                        isSelected={selectedIndex === idx}
                        onClick={() =>
                          handleItemClick({ type: 'directory', name: d.name, path: d.path })
                        }
                      />
                    ))}
                  </div>
                )}

                {/* Group: Tables */}
                {results && results.tables.length > 0 && (
                  <div>
                    <div className="px-4 py-1 text-xs font-medium text-muted-foreground uppercase mt-2">
                      Tables
                    </div>
                    {results.tables.map((t, idx) => (
                      <ResultItem
                        key={`tbl-${t.path}`}
                        item={{
                          type: 'table',
                          name: t.name,
                          path: t.path,
                          subtype: t.type,
                        }}
                        isSelected={
                          selectedIndex === (results.directories.length + idx)
                        }
                        onClick={() =>
                          handleItemClick({
                            type: 'table',
                            name: t.name,
                            path: t.path,
                            subtype: t.type,
                          })
                        }
                      />
                    ))}
                  </div>
                )}

                {/* Group: Columns */}
                {results && results.columns.length > 0 && (
                  <div>
                    <div className="px-4 py-1 text-xs font-medium text-muted-foreground uppercase mt-2">
                      Columns
                    </div>
                    {results.columns.map((c, idx) => (
                      <ResultItem
                        key={`col-${c.table}-${c.name}`}
                        item={{
                          type: 'column',
                          name: c.name,
                          path: c.table,
                          extra: c.type,
                        }}
                        isSelected={
                          selectedIndex ===
                          (results.directories.length + results.tables.length + idx)
                        }
                        onClick={() =>
                          handleItemClick({
                            type: 'column',
                            name: c.name,
                            path: c.table,
                            extra: c.type,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!loading && !query && (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">
                  Start typing to search across your Pixeltable instance
                </p>
                <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
                  <span>
                    <kbd className="bg-background px-1.5 py-0.5 rounded border border-border">↑↓</kbd> navigate
                  </span>
                  <span>
                    <kbd className="bg-background px-1.5 py-0.5 rounded border border-border">Enter</kbd> select
                  </span>
                  <span>
                    <kbd className="bg-background px-1.5 py-0.5 rounded border border-border">Esc</kbd> close
                  </span>
                </div>
              </div>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
