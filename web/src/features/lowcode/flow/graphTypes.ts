/**
 * Shared graph model for the visual flow/workflow canvas. Both the low-code flow
 * editor and the moderation workflow editor derive an array of these positioned
 * nodes + edges from their own model, hand them to <FlowCanvas>, and edit the
 * selected node through a structured inspector. The canvas never reconstructs the
 * model from free-form edges — the model stays the source of truth and the graph
 * is a rendered projection of it, which keeps round-tripping correct.
 */
export type NodeKind = 'trigger' | 'condition' | 'action' | 'parallel' | 'step' | 'end';

export interface GraphNodeData {
  kind: NodeKind;
  title: string;
  subtitle?: string;
  badge?: string;
  /** Named source handles for branching nodes (e.g. ['then','else']). */
  sourceHandles?: string[];
  selected?: boolean;
  onSelect?: () => void;
}

export interface GraphNode {
  id: string;
  data: GraphNodeData;
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

export const KIND_ACCENT: Record<NodeKind, string> = {
  trigger: 'var(--exprsn-info, #3b82f6)',
  condition: 'var(--exprsn-warning, #f59e0b)',
  action: 'var(--exprsn-success, #10b981)',
  parallel: 'var(--exprsn-secondary, #7c3aed)',
  step: 'var(--exprsn-info, #3b82f6)',
  end: 'var(--exprsn-gray-500, #737373)',
};
