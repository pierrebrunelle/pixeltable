import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface TableNodeData {
  name: string;
  path: string;
  type: 'table' | 'view' | 'snapshot' | 'replica';
  columnCount: number;
  rowCount: number;
}

// Kandinsky-inspired type colors
const typeColors = {
  table: {
    border: '#7DA8EF',  // kandinsky-blue-light
    bg: 'rgba(125, 168, 239, 0.12)',
    badge: '#022A59',  // kandinsky-blue
  },
  view: {
    border: '#a855f7',  // purple
    bg: 'rgba(168, 85, 247, 0.12)',
    badge: '#7c3aed',
  },
  snapshot: {
    border: '#DC2404',  // kandinsky-red
    bg: 'rgba(220, 36, 4, 0.12)',
    badge: '#C82302',
  },
  replica: {
    border: '#AAA498',  // kandinsky-gray
    bg: 'rgba(170, 164, 152, 0.12)',
    badge: '#7a756b',
  },
};

function TableNodeComponent({ data }: NodeProps<TableNodeData>) {
  const colors = typeColors[data.type];

  return (
    <div
      style={{
        minWidth: 200,
        borderRadius: 12,
        border: `2px solid ${colors.border}`,
        backgroundColor: colors.bg,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#AAA498',
          width: 10,
          height: 10,
          left: -5,
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '8px 16px',
          backgroundColor: 'rgba(2, 7, 4, 0.5)', // kandinsky-black overlay
          borderBottom: '1px solid rgba(71, 85, 105, 0.5)',
        }}
      >
        <span
          style={{
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            borderRadius: 4,
            backgroundColor: colors.badge,
            color: 'white',
          }}
        >
          {data.type}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px' }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 14,
            fontWeight: 700,
            color: '#f2f2f2',
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 170,
          }}
        >
          {data.name}
        </div>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: '#AAA498', // kandinsky-gray
            marginBottom: 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 180,
          }}
        >
          {data.path}
        </div>
        <div style={{ fontSize: 11, color: '#a3a3a3' }}>
          {data.columnCount} cols · {data.rowCount.toLocaleString()} rows
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#AAA498',
          width: 10,
          height: 10,
          right: -5,
        }}
      />
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
