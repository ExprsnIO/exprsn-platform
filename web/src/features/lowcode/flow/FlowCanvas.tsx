/**
 * FlowCanvas — a reactflow surface that renders a projection of a flow/workflow
 * model (positioned GraphNodes + GraphEdges) and reports node selection. Nodes
 * are not hand-connectable; structure is owned by the model and edited via the
 * inspector, so the canvas is a faithful, always-valid WYSIWYG view.
 */
import { useMemo } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Handle, Position, MarkerType,
  type Node, type Edge, type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Typography } from '@mui/material';
import type { GraphNode, GraphEdge, GraphNodeData } from './graphTypes';
import { KIND_ACCENT } from './graphTypes';

function CanvasNode({ data }: NodeProps<GraphNodeData>) {
  const accent = KIND_ACCENT[data.kind];
  const handles = data.sourceHandles ?? ['out'];
  return (
    <Box
      onClick={data.onSelect}
      sx={{
        minWidth: 180, maxWidth: 240, borderRadius: 2, cursor: 'pointer',
        border: '2px solid', borderColor: data.selected ? accent : 'divider',
        bgcolor: 'background.paper', boxShadow: data.selected ? 4 : 1,
        borderLeft: `6px solid ${accent}`,
      }}
    >
      {data.kind !== 'trigger' && <Handle type="target" position={Position.Top} style={{ background: accent }} />}
      <Box sx={{ px: 1.5, py: 1 }}>
        <Stack>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {data.badge && (
              <Box component="span" sx={{ fontSize: 10, fontWeight: 700, color: 'var(--exprsn-text-inverse)', bgcolor: accent, px: 0.75, py: 0.25, borderRadius: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {data.badge}
              </Box>
            )}
          </Box>
          <Typography variant="body2" fontWeight={600} noWrap title={data.title}>{data.title}</Typography>
          {data.subtitle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }} title={data.subtitle}>{data.subtitle}</Typography>}
        </Stack>
      </Box>
      {handles.map((h, i) => (
        <Handle
          key={h} id={h} type="source" position={Position.Bottom}
          style={{ background: accent, left: handles.length > 1 ? `${((i + 1) / (handles.length + 1)) * 100}%` : '50%' }}
        />
      ))}
    </Box>
  );
}

// tiny local Stack to avoid an extra import churn in the node
function Stack({ children }: { children: React.ReactNode }) {
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>{children}</Box>;
}

const nodeTypes = { canvas: CanvasNode };

export function FlowCanvas({
  nodes, edges, height = 460,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height?: number | string;
}) {
  const rfNodes: Node<GraphNodeData>[] = useMemo(
    () => nodes.map((n) => ({ id: n.id, type: 'canvas', position: n.position, data: n.data })),
    [nodes],
  );
  const rfEdges: Edge[] = useMemo(
    () => edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle,
      label: e.label, animated: false, markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 1.5 }, labelStyle: { fontSize: 11 },
    })),
    [edges],
  );

  return (
    <Box sx={{ height, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      </ReactFlow>
    </Box>
  );
}
