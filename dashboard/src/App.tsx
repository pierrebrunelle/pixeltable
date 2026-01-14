import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { DirectoryTree } from '@/components/DirectoryTree';
import { TableSchema } from '@/components/TableSchema';
import { DataPreview } from '@/components/DataPreview';
import { LineageGraph } from '@/components/LineageGraph';
import { SearchPanel } from '@/components/SearchPanel';
import { InformationSchema } from '@/components/InformationSchema';
import { ERDiagram } from '@/components/ERDiagram';
import { getDirectoryTree } from '@/api/client';
import type { TreeNode } from '@/types';
import {
  TableCellsIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  CircleStackIcon,
  ShareIcon,
} from '@heroicons/react/24/outline';

type ViewMode = 'schema' | 'data' | 'lineage';

function TableView() {
  const { '*': tablePath } = useParams();
  const [viewMode, setViewMode] = useState<ViewMode>('schema');

  if (!tablePath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Select a table from the sidebar to view its details</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* View mode tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card">
        <button
          onClick={() => setViewMode('schema')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'schema'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <TableCellsIcon className="w-4 h-4" />
          Schema
        </button>
        <button
          onClick={() => setViewMode('data')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'data'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <Squares2X2Icon className="w-4 h-4" />
          Data
        </button>
        <button
          onClick={() => setViewMode('lineage')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'lineage'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <ChartBarIcon className="w-4 h-4" />
          Lineage
        </button>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'schema' && <TableSchema tablePath={tablePath} />}
        {viewMode === 'data' && <DataPreview tablePath={tablePath} />}
        {viewMode === 'lineage' && <LineageGraph tablePath={tablePath} />}
      </div>
    </div>
  );
}

function WelcomeView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      {/* Kandinsky-inspired logo */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-2">
          <div className="w-10 h-10 bg-kandinsky-yellow rounded-lg" />
          <div className="w-10 h-10 bg-kandinsky-red rounded-lg" />
          <div className="w-10 h-10 bg-kandinsky-blue rounded-lg" />
          <div className="w-10 h-10 bg-kandinsky-blue-light rounded-lg" />
        </div>
      </div>
      <h1 className="text-3xl font-bold text-foreground mb-2">
        Pixeltable Dashboard
      </h1>
      <p className="text-muted-foreground max-w-md">
        Explore your directories, tables, views, and snapshots.
        Select an item from the sidebar to get started.
      </p>
      <div className="mt-8 text-sm text-muted-foreground">
        Press <kbd className="px-2 py-1 bg-accent rounded border border-border">⌘K</kbd> to search
      </div>
    </div>
  );
}

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    getDirectoryTree()
      .then(setTree)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Global keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectItem = (path: string, type: string) => {
    if (type === 'directory') {
      navigate(`/dir/${path}`);
    } else {
      navigate(`/table/${path}`);
    }
  };

  const handleSearchSelect = (path: string, type: string) => {
    setSearchOpen(false);
    handleSelectItem(path, type);
  };

  // Get selected path from URL
  const selectedPath = location.pathname.startsWith('/table/')
    ? location.pathname.replace('/table/', '')
    : location.pathname.startsWith('/dir/')
    ? location.pathname.replace('/dir/', '')
    : null;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
          sidebarCollapsed ? 'w-12' : 'w-72'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          {!sidebarCollapsed && (
            <h1 className="text-lg font-bold text-primary">
              Pixeltable
            </h1>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {sidebarCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>

        {/* Search and schema buttons */}
        {!sidebarCollapsed && (
          <div className="m-3 space-y-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground bg-background border border-border rounded-lg hover:border-primary transition-colors"
            >
              <MagnifyingGlassIcon className="w-4 h-4" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="text-xs bg-accent px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
            </button>
            <button
              onClick={() => navigate('/schema')}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                location.pathname === '/schema'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground bg-background border border-border hover:border-primary'
              }`}
            >
              <CircleStackIcon className="w-4 h-4" />
              <span className="flex-1 text-left">Information Schema</span>
            </button>
            <button
              onClick={() => navigate('/erd')}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                location.pathname === '/erd'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground bg-background border border-border hover:border-primary'
              }`}
            >
              <ShareIcon className="w-4 h-4" />
              <span className="flex-1 text-left">ERD Diagram</span>
            </button>
          </div>
        )}

        {/* Directory tree */}
        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 rounded-md hover:bg-accent text-muted-foreground"
                title="Search"
              >
                <MagnifyingGlassIcon className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <DirectoryTree
              nodes={tree}
              selectedPath={selectedPath}
              onSelect={handleSelectItem}
            />
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<WelcomeView />} />
          <Route path="/schema" element={<InformationSchema />} />
          <Route path="/erd" element={<ERDiagram />} />
          <Route path="/table/*" element={<TableView />} />
          <Route path="/dir/*" element={<WelcomeView />} />
        </Routes>
      </main>

      {/* Search panel */}
      <SearchPanel
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
    </div>
  );
}
