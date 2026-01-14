import { useState } from 'react';
import type { TreeNode } from '@/types';
import {
  FolderIcon,
  FolderOpenIcon,
  TableCellsIcon,
  EyeIcon,
  CameraIcon,
  DocumentDuplicateIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

interface DirectoryTreeProps {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string, type: string) => void;
}

interface TreeItemProps {
  node: TreeNode;
  level: number;
  selectedPath: string | null;
  onSelect: (path: string, type: string) => void;
}

function getNodeIcon(type: string, isOpen: boolean = false) {
  switch (type) {
    case 'directory':
      return isOpen ? (
        <FolderOpenIcon className="w-4 h-4 text-kandinsky-yellow" />
      ) : (
        <FolderIcon className="w-4 h-4 text-kandinsky-yellow" />
      );
    case 'table':
      return <TableCellsIcon className="w-4 h-4 text-kandinsky-blue-light" />;
    case 'view':
      return <EyeIcon className="w-4 h-4 text-purple-400" />;
    case 'snapshot':
      return <CameraIcon className="w-4 h-4 text-orange-400" />;
    case 'replica':
      return <DocumentDuplicateIcon className="w-4 h-4 text-kandinsky-gray" />;
    default:
      return <TableCellsIcon className="w-4 h-4 text-muted-foreground" />;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'directory':
      return 'Directory';
    case 'table':
      return 'Table';
    case 'view':
      return 'View';
    case 'snapshot':
      return 'Snapshot';
    case 'replica':
      return 'Replica';
    default:
      return type;
  }
}

function TreeItem({ node, level, selectedPath, onSelect }: TreeItemProps) {
  const [isOpen, setIsOpen] = useState(level === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isDirectory = node.type === 'directory';
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isDirectory && hasChildren) {
      setIsOpen(!isOpen);
    }
    onSelect(node.path, node.type);
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary/20 text-primary'
            : 'hover:bg-accent text-foreground'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        title={`${getTypeLabel(node.type)}: ${node.path}`}
      >
        {/* Expand/collapse indicator for directories */}
        {isDirectory && hasChildren ? (
          <span className="w-4 h-4 flex items-center justify-center text-muted-foreground">
            {isOpen ? (
              <ChevronDownIcon className="w-3 h-3" />
            ) : (
              <ChevronRightIcon className="w-3 h-3" />
            )}
          </span>
        ) : (
          <span className="w-4 h-4" />
        )}

        {/* Icon */}
        {getNodeIcon(node.type, isOpen)}

        {/* Name */}
        <span className="flex-1 text-sm truncate">{node.name}</span>

        {/* Version badge for tables */}
        {!isDirectory && node.version !== null && node.version !== undefined && (
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            v{node.version}
          </span>
        )}

        {/* Type indicator */}
        {!isDirectory && node.type !== 'table' && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              node.type === 'view'
                ? 'bg-purple-500/20 text-purple-400'
                : node.type === 'snapshot'
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-kandinsky-gray/20 text-kandinsky-gray'
            }`}
          >
            {node.type}
          </span>
        )}
      </div>

      {/* Children */}
      {isDirectory && hasChildren && isOpen && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DirectoryTree({ nodes, selectedPath, onSelect }: DirectoryTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <FolderIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No directories or tables found</p>
        <p className="text-xs mt-1">
          Create tables using the Python SDK
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          level={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
