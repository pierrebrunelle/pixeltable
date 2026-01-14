import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface ColumnNodeData {
  name: string;
  type: string;
  isComputed: boolean;
  isExternal: boolean;
  computedWith?: string | null;
}

// Kandinsky color palette
const colors = {
  computed: {
    border: '#F1AE03',  // kandinsky-yellow
    bg: 'rgba(241, 174, 3, 0.15)',
    text: '#F1AE03',
  },
  external: {
    border: '#DC2404',  // kandinsky-red  
    bg: 'rgba(220, 36, 4, 0.12)',
    text: '#DC2404',
  },
  stored: {
    border: '#7DA8EF',  // kandinsky-blue-light
    bg: 'rgba(125, 168, 239, 0.12)',
    text: '#7DA8EF',
  },
};

function ColumnNodeComponent({ data }: NodeProps<ColumnNodeData>) {
  const colorSet = data.isComputed
    ? colors.computed
    : data.isExternal
    ? colors.external
    : colors.stored;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        border: `2px solid ${colorSet.border}`,
        backgroundColor: colorSet.bg,
        minWidth: 160,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#AAA498', // kandinsky-gray
          width: 8,
          height: 8,
        }}
      />

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            fontWeight: 600,
            color: '#f2f2f2',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 140,
          }}
        >
          {data.name}
        </div>
        <div style={{ marginTop: 6 }}>
          <span
            style={{
              padding: '2px 8px',
              fontSize: 11,
              borderRadius: 4,
              backgroundColor: 'rgba(2, 42, 89, 0.6)', // kandinsky-blue
              color: '#7DA8EF',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {data.type}
          </span>
        </div>
        {data.isComputed && (
          <div style={{ marginTop: 4, fontSize: 10, color: colors.computed.text }}>
            computed
          </div>
        )}
        {data.isExternal && (
          <div style={{ marginTop: 4, fontSize: 10, color: colors.external.text }}>
            from base
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#AAA498',
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
}

export const ColumnNode = memo(ColumnNodeComponent);
