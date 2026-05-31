export type WorkflowId = string;
export type WorkflowRunId = string;
export type WorkflowNodeId = string;

export type WorkflowNodeType = "task" | "condition" | "delay";

export type WorkflowNode = {
  id: WorkflowNodeId;
  type: WorkflowNodeType;
  name: string;
  config: Record<string, unknown>;
};

export type WorkflowEdge = {
  id: string;
  from: WorkflowNodeId;
  to: WorkflowNodeId;
  condition?: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type Workflow = {
  id: WorkflowId;
  name: string;
  description?: string;
  graph: WorkflowGraph;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkflowInput = {
  name: string;
  description?: string;
  graph: WorkflowGraph;
};

export type UpdateWorkflowInput = Partial<CreateWorkflowInput>;
