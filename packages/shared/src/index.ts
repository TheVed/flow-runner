export type WorkflowId = string;
export type WorkflowRunId = string;
export type WorkflowNodeId = string;
export type StepRunId = string;
export type AuditLogId = string;
export type DeadLetterJobId = string;

export type WorkflowNodeType = "task" | "condition" | "delay";

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
};

export type WorkflowNode = {
  id: WorkflowNodeId;
  type: WorkflowNodeType;
  name: string;
  config: Record<string, unknown>;
  retryPolicy?: RetryPolicy;
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

export type WorkflowRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type StepRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "RETRYING" | "SKIPPED";

export type StepRun = {
  id: StepRunId;
  workflowRunId: WorkflowRunId;
  nodeId: WorkflowNodeId;
  status: StepRunStatus;
  attempt: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type WorkflowRun = {
  id: WorkflowRunId;
  workflowId: WorkflowId;
  status: WorkflowRunStatus;
  startedAt: string;
  completedAt?: string;
  currentNodeId?: WorkflowNodeId;
  stepRuns: StepRun[];
};

export type AuditEventType =
  | "WORKFLOW_CREATED"
  | "WORKFLOW_UPDATED"
  | "WORKFLOW_DELETED"
  | "WORKFLOW_STARTED"
  | "STEP_QUEUED"
  | "STEP_STARTED"
  | "STEP_COMPLETED"
  | "STEP_FAILED"
  | "STEP_RETRIED"
  | "WORKFLOW_COMPLETED"
  | "WORKFLOW_FAILED"
  | "DEAD_LETTER_CREATED";

export type AuditLog = {
  id: AuditLogId;
  eventType: AuditEventType;
  workflowId?: WorkflowId;
  workflowRunId?: WorkflowRunId;
  stepRunId?: StepRunId;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DeadLetterJob = {
  id: DeadLetterJobId;
  workflowId: WorkflowId;
  workflowRunId: WorkflowRunId;
  stepRunId: StepRunId;
  nodeId: WorkflowNodeId;
  error: string;
  attempts: number;
  payload: Record<string, unknown>;
  createdAt: string;
};
