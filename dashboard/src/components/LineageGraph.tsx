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
import { useApi } from '@/hooks/useApi';
import { getTableLineage } from '@/api/client';
import type { LineageGraph as LineageGraphType } from '@/types';
import { ColumnNode, type ColumnNodeData } from './nodes/ColumnNode';

// Kandinsky colors
const colors = {
  edge: '#F1AE03',           // kandinsky-yellow
  computed: '#F1AE03',       // kandinsky-yellow
  external: '#DC2404',       // kandinsky-red
  stored: '#7DA8EF',         // kandinsky-blue-light
};

interface LineageGraphProps {
  tablePath: string;
}

const nodeTypes = { column: ColumnNode };

function layoutNodes(nodes: LineageGraphType['nodes'], edges: LineageGraphType['edges']) {
  // Group by table for hierarchical layout
  const tableGroups = new Map<string, typeof nodes>();
  nodes.forEach(node => {
    const group = tableGroups.get(node.table) || [];
    group.push(node);
    tableGroups.set(node.table, group);
  });

  const flowNodes: Node<ColumnNodeData>[] = [];
  let xOffset = 0;

  tableGroups.forEach((groupNodes) => {
    groupNodes.forEach((node, idx) => {
      flowNodes.push({
        id: node.id,
        type: 'column',
        position: { x: xOffset, y: idx * 100 },
        data: {
          name: node.name,
          type: node.type,
          isComputed: node.is_computed,
          isExternal: node.is_external,
          computedWith: node.computed_with,
        },
      });
    });
    xOffset += 250;
  });

  const flowEdges: Edge[] = edges.map((edge, idx) => ({
    id: `edge-${idx}`,
    source: edge.source,
    target: edge.target,
    animated: true,
    style: { stroke: colors.edge, strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: colors.edge },
  }));

  return { flowNodes, flowEdges };
}

export function LineageGraph({ tablePath }: LineageGraphProps) {
  const { data: lineage, loading, error } = useApi<LineageGraphType>(
    () => getTableLineage(tablePath),
    [tablePath]
  );

  const { layoutNodes: computedNodes, layoutEdges: computedEdges } = useMemo(() => {
    if (!lineage) return { layoutNodes: [], layoutEdges: [] };
    const { flowNodes, flowEdges } = layoutNodes(lineage.nodes, lineage.edges);
    return { layoutNodes: flowNodes, layoutEdges: flowEdges };
  }, [lineage]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes/edges when data changes
  useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges, setNodes, setEdges]);

  const minimapNodeColor = useCallback((node: Node) => {
    const data = node.data as ColumnNodeData;
    if (data.isComputed) return colors.computed;
    if (data.isExternal) return colors.external;
    return colors.stored;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-kandinsky-red">
        <p className="text-lg font-medium">Error loading lineage</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (!lineage || lineage.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground text-lg">No column lineage</p>
          <p className="text-muted-foreground/70 text-sm mt-1">
            This table has no computed columns or dependencies
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
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
      <div className="absolute bottom-4 left-4 z-10 bg-card/90 border border-border rounded-lg p-3">
        <div className="text-xs font-medium text-foreground mb-2">Legend</div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded-sm" style={{ background: 'rgba(241, 174, 3, 0.15)', border: `1px solid ${colors.computed}` }} />
            <span className="text-muted-foreground">Computed column</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded-sm" style={{ background: 'rgba(125, 168, 239, 0.12)', border: `1px solid ${colors.stored}` }} />
            <span className="text-muted-foreground">Stored column</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 rounded-sm" style={{ background: 'rgba(220, 36, 4, 0.12)', border: `1px solid ${colors.external}` }} />
            <span className="text-muted-foreground">From base table</span>
          </div>
        </div>
      </div>
    </div>
  );
}
