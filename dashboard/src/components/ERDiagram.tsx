import { useMemo, useCallback, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useApi } from '../hooks/useApi';
import type { InformationSchema } from '../types';

// Kandinsky colors
const colors = {
  table: { bg: '#022A59', border: '#7DA8EF' },      // kandinsky-blue
  view: { bg: '#7c3aed', border: '#a855f7' },       // purple
  snapshot: { bg: '#C82302', border: '#DC2404' },   // kandinsky-red
  edgeBase: '#F1AE03',                              // kandinsky-yellow
  edgeRef: '#7DA8EF',                               // kandinsky-blue-light
};

interface SimpleNodeData {
  label: string;
}

function layoutTables(schema: InformationSchema) {
  const nodes: Node<SimpleNodeData>[] = [];
  const edges: Edge[] = [];
  const tablePathSet = new Set(schema.tables.map(t => t.path));

  // Grid layout
  const cols = Math.ceil(Math.sqrt(schema.tables.length));
  const xSpacing = 200;
  const ySpacing = 100;

  schema.tables.forEach((table, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const typeColor = table.type === 'view' ? colors.view 
      : table.type === 'snapshot' ? colors.snapshot 
      : colors.table;

    nodes.push({
      id: table.path,
      type: 'default',
      position: { x: col * xSpacing, y: row * ySpacing },
      data: {
        label: `${table.name}\n${table.column_count} cols`,
      },
      style: {
        background: typeColor.bg,
        color: 'white',
        border: `2px solid ${typeColor.border}`,
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
        width: 150,
        fontFamily: 'JetBrains Mono, monospace',
      },
    });

    // Edge from base table to view
    if (table.base && tablePathSet.has(table.base)) {
      edges.push({
        id: `base-${table.path}`,
        source: table.base,
        target: table.path,
        style: { stroke: colors.edgeBase, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: colors.edgeBase },
      });
    }
  });

  // Add column reference edges
  const edgeSet = new Set(edges.map(e => `${e.source}-${e.target}`));
  schema.columns.forEach(col => {
    if (col.defined_in && col.defined_in !== col.table_name && tablePathSet.has(col.defined_in)) {
      const edgeKey = `${col.defined_in}-${col.table_path}`;
      const reverseKey = `${col.table_path}-${col.defined_in}`;
      if (!edgeSet.has(edgeKey) && !edgeSet.has(reverseKey)) {
        edges.push({
          id: `ref-${col.column_name}-${col.table_path}`,
          source: col.defined_in,
          target: col.table_path,
          style: { stroke: colors.edgeRef, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: colors.edgeRef },
        });
        edgeSet.add(edgeKey);
      }
    }
  });

  return { nodes, edges };
}

export function ERDiagram() {
  const { data: schema, loading, error } = useApi<InformationSchema>('/api/schema');

  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!schema) return { layoutNodes: [], layoutEdges: [] };
    const { nodes, edges } = layoutTables(schema);
    return { layoutNodes: nodes, layoutEdges: edges };
  }, [schema]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes/edges when data changes
  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const minimapNodeColor = useCallback(() => {
    return colors.table.border;
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading ERD...</div>
      </div>
    );
  }

  if (error || !schema) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-kandinsky-red">Error loading ERD: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-6">
        <h1 className="text-2xl font-bold text-foreground">
          Entity Relationship Diagram
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Showing {schema.tables.length} tables and their relationships
        </p>
      </div>

      {/* ERD Canvas */}
      <div style={{ width: '100%', height: 'calc(100vh - 160px)', position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.3, minZoom: 0.1, maxZoom: 1 }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.3 }}
          minZoom={0.05}
          maxZoom={2}
          style={{ width: '100%', height: '100%', background: '#020704' }}
        >
          <Background color="#1a1d1a" gap={20} />
          <Controls className="!bg-[#0E110E] !border-[#2d2d2d] !rounded-lg [&>button]:!bg-[#0E110E] [&>button]:!border-[#2d2d2d] [&>button]:!fill-[#a3a3a3] [&>button:hover]:!bg-[#1a1d1a]" />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(2, 7, 4, 0.8)"
            className="!bg-[#0E110E] !border-[#2d2d2d] !rounded-lg"
          />
        </ReactFlow>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 bg-card/90 backdrop-blur-sm rounded-xl p-4 border border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3">Legend</h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: colors.table.bg, border: `2px solid ${colors.table.border}` }} />
              <span className="text-muted-foreground">Table</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: colors.view.bg, border: `2px solid ${colors.view.border}` }} />
              <span className="text-muted-foreground">View</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: colors.snapshot.bg, border: `2px solid ${colors.snapshot.border}` }} />
              <span className="text-muted-foreground">Snapshot</span>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
              <div className="w-6 h-0.5" style={{ background: colors.edgeBase }} />
              <span className="text-muted-foreground">Base table</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5" style={{ background: colors.edgeRef }} />
              <span className="text-muted-foreground">Column reference</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
