import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AuditEventType,
  AuditLog,
  CreateWorkflowInput,
  DeadLetterJob,
  StepRun,
  UpdateWorkflowInput,
  Workflow,
  WorkflowGraph,
  WorkflowNode,
  WorkflowRun,
} from "@flow-runner/shared";

const port = Number(process.env.PORT ?? 3000);

const workflows = new Map<string, Workflow>();
const workflowRuns = new Map<string, WorkflowRun>();
const auditLogs: AuditLog[] = [];
const deadLetterJobs: DeadLetterJob[] = [];

const sendJson = (response: ServerResponse, statusCode: number, body: unknown) => {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
};

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody) {
    throw new Error("Request body is required");
  }

  return JSON.parse(rawBody) as T;
};

const logAudit = (
  eventType: AuditEventType,
  message: string,
  metadata: Record<string, unknown> = {}
) => {
  auditLogs.push({
    id: randomUUID(),
    eventType,
    workflowId: metadata.workflowId as string | undefined,
    workflowRunId: metadata.workflowRunId as string | undefined,
    stepRunId: metadata.stepRunId as string | undefined,
    message,
    metadata,
    createdAt: new Date().toISOString(),
  });
};

const isWorkflowGraph = (value: unknown): value is WorkflowGraph => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const graph = value as WorkflowGraph;
  return Array.isArray(graph.nodes) && Array.isArray(graph.edges);
};

const validateCreateWorkflowInput = (input: CreateWorkflowInput): string | null => {
  if (!input || typeof input !== "object") {
    return "Request body must be a workflow object";
  }

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return "Workflow name is required";
  }

  if (input.description !== undefined && typeof input.description !== "string") {
    return "Workflow description must be a string";
  }

  if (!isWorkflowGraph(input.graph)) {
    return "Workflow graph must include nodes and edges arrays";
  }

  return null;
};

const findStartNode = (graph: WorkflowGraph) => {
  const targetNodeIds = new Set(graph.edges.map((edge) => edge.to));
  return graph.nodes.find((node) => !targetNodeIds.has(node.id)) ?? graph.nodes[0];
};

const findNextNode = (
  workflow: Workflow,
  currentNode: WorkflowNode,
  lastOutput: Record<string, unknown>
) => {
  const outgoingEdges = workflow.graph.edges.filter((edge) => edge.from === currentNode.id);

  if (outgoingEdges.length === 0) {
    return undefined;
  }

  const selectedEdge =
    outgoingEdges.find((edge) => edge.condition === lastOutput.branch) ??
    outgoingEdges.find((edge) => !edge.condition) ??
    outgoingEdges[0];

  if (!selectedEdge) {
    return undefined;
  }

  return workflow.graph.nodes.find((node) => node.id === selectedEdge.to);
};

const queueStep = (run: WorkflowRun, node: WorkflowNode, delayMs = 0) => {
  const maxAttempts = node.retryPolicy?.maxAttempts ?? 1;
  const stepRun: StepRun = {
    id: randomUUID(),
    workflowRunId: run.id,
    nodeId: node.id,
    status: "QUEUED",
    attempt: 1,
    maxAttempts,
    scheduledAt: new Date(Date.now() + delayMs).toISOString(),
  };

  run.stepRuns.push(stepRun);
  run.currentNodeId = node.id;
  logAudit("STEP_QUEUED", `Queued step ${node.name}`, {
    workflowId: run.workflowId,
    workflowRunId: run.id,
    stepRunId: stepRun.id,
    nodeId: node.id,
    delayMs,
  });

  executeStep(run, node, stepRun);
};

const createDeadLetterJob = (
  workflow: Workflow,
  run: WorkflowRun,
  node: WorkflowNode,
  stepRun: StepRun
) => {
  const deadLetterJob: DeadLetterJob = {
    id: randomUUID(),
    workflowId: workflow.id,
    workflowRunId: run.id,
    stepRunId: stepRun.id,
    nodeId: node.id,
    error: stepRun.error ?? "Step failed",
    attempts: stepRun.attempt,
    payload: node.config,
    createdAt: new Date().toISOString(),
  };

  deadLetterJobs.push(deadLetterJob);
  logAudit("DEAD_LETTER_CREATED", `Moved step ${node.name} to the dead letter queue`, {
    workflowId: workflow.id,
    workflowRunId: run.id,
    stepRunId: stepRun.id,
    deadLetterJobId: deadLetterJob.id,
  });
};

const completeWorkflowRun = (run: WorkflowRun) => {
  run.status = "COMPLETED";
  run.completedAt = new Date().toISOString();
  logAudit("WORKFLOW_COMPLETED", "Workflow run completed", {
    workflowId: run.workflowId,
    workflowRunId: run.id,
  });
};

const failWorkflowRun = (
  workflow: Workflow,
  run: WorkflowRun,
  node: WorkflowNode,
  stepRun: StepRun
) => {
  run.status = "FAILED";
  run.completedAt = new Date().toISOString();
  createDeadLetterJob(workflow, run, node, stepRun);
  logAudit("WORKFLOW_FAILED", "Workflow run failed", {
    workflowId: workflow.id,
    workflowRunId: run.id,
    stepRunId: stepRun.id,
  });
};

const runNode = (node: WorkflowNode): Record<string, unknown> => {
  if (node.type === "delay") {
    return { delayMs: Number(node.config.delayMs ?? 0) };
  }

  if (node.type === "condition") {
    return { branch: String(node.config.branch ?? "success") };
  }

  if (node.config.shouldFail === true) {
    throw new Error(String(node.config.errorMessage ?? "Task node failed"));
  }

  return { message: node.config.message ?? `${node.name} completed` };
};

const executeStep = (run: WorkflowRun, node: WorkflowNode, stepRun: StepRun) => {
  const workflow = workflows.get(run.workflowId);

  if (!workflow || run.status === "CANCELLED") {
    return;
  }

  const scheduledDelayMs = Math.max(0, Date.parse(stepRun.scheduledAt) - Date.now());

  setTimeout(() => {
    stepRun.status = "RUNNING";
    stepRun.startedAt = new Date().toISOString();
    logAudit("STEP_STARTED", `Started step ${node.name}`, {
      workflowId: workflow.id,
      workflowRunId: run.id,
      stepRunId: stepRun.id,
      nodeId: node.id,
      attempt: stepRun.attempt,
    });

    try {
      const output = runNode(node);
      stepRun.status = "COMPLETED";
      stepRun.completedAt = new Date().toISOString();
      logAudit("STEP_COMPLETED", `Completed step ${node.name}`, {
        workflowId: workflow.id,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        nodeId: node.id,
        output,
      });

      const delayMs = Number(output.delayMs ?? 0);
      const nextNode = findNextNode(workflow, node, output);

      if (!nextNode) {
        completeWorkflowRun(run);
        return;
      }

      queueStep(run, nextNode, delayMs);
    } catch (error) {
      stepRun.error = error instanceof Error ? error.message : "Unknown step failure";
      logAudit("STEP_FAILED", `Failed step ${node.name}`, {
        workflowId: workflow.id,
        workflowRunId: run.id,
        stepRunId: stepRun.id,
        nodeId: node.id,
        attempt: stepRun.attempt,
        error: stepRun.error,
      });

      if (stepRun.attempt < stepRun.maxAttempts) {
        const retryDelayMs = node.retryPolicy?.backoffMs ?? 0;
        stepRun.status = "RETRYING";
        stepRun.attempt += 1;
        stepRun.scheduledAt = new Date(Date.now() + retryDelayMs).toISOString();
        logAudit("STEP_RETRIED", `Retrying step ${node.name}`, {
          workflowId: workflow.id,
          workflowRunId: run.id,
          stepRunId: stepRun.id,
          nodeId: node.id,
          attempt: stepRun.attempt,
          retryDelayMs,
        });
        executeStep(run, node, stepRun);
        return;
      }

      stepRun.status = "FAILED";
      stepRun.completedAt = new Date().toISOString();
      failWorkflowRun(workflow, run, node, stepRun);
    }
  }, scheduledDelayMs);
};

const triggerWorkflowRun = (workflow: Workflow) => {
  const startNode = findStartNode(workflow.graph);
  const run: WorkflowRun = {
    id: randomUUID(),
    workflowId: workflow.id,
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    currentNodeId: startNode?.id,
    stepRuns: [],
  };

  workflowRuns.set(run.id, run);
  logAudit("WORKFLOW_STARTED", "Workflow run started", {
    workflowId: workflow.id,
    workflowRunId: run.id,
  });

  if (!startNode) {
    completeWorkflowRun(run);
    return run;
  }

  queueStep(run, startNode);
  return run;
};

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const workflowId = /^\/workflows\/([^/]+)$/.exec(url.pathname)?.[1];
  const workflowRunPath = /^\/workflows\/([^/]+)\/runs$/.exec(url.pathname);
  const runId = /^\/runs\/([^/]+)$/.exec(url.pathname)?.[1];
  const retryRunPath = /^\/runs\/([^/]+)\/retry$/.exec(url.pathname);

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "flow-runner-api",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/workflows") {
    sendJson(response, 200, { data: Array.from(workflows.values()) });
    return;
  }

  if (method === "POST" && url.pathname === "/workflows") {
    try {
      const input = await readJsonBody<CreateWorkflowInput>(request);
      const validationError = validateCreateWorkflowInput(input);

      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const timestamp = new Date().toISOString();
      const workflow: Workflow = {
        id: randomUUID(),
        name: input.name.trim(),
        description: input.description,
        graph: input.graph,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      workflows.set(workflow.id, workflow);
      logAudit("WORKFLOW_CREATED", "Workflow created", { workflowId: workflow.id });
      sendJson(response, 201, { data: workflow });
    } catch {
      sendJson(response, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (workflowRunPath && method === "POST") {
    const workflow = workflows.get(workflowRunPath[1] ?? "");

    if (!workflow) {
      sendJson(response, 404, { error: "Workflow not found" });
      return;
    }

    sendJson(response, 202, { data: triggerWorkflowRun(workflow) });
    return;
  }

  if (method === "GET" && url.pathname === "/runs") {
    sendJson(response, 200, { data: Array.from(workflowRuns.values()) });
    return;
  }

  if (runId && method === "GET") {
    const run = workflowRuns.get(runId);

    if (!run) {
      sendJson(response, 404, { error: "Workflow run not found" });
      return;
    }

    sendJson(response, 200, { data: run });
    return;
  }

  if (retryRunPath && method === "POST") {
    const run = workflowRuns.get(retryRunPath[1] ?? "");
    const workflow = run ? workflows.get(run.workflowId) : undefined;

    if (!run || !workflow) {
      sendJson(response, 404, { error: "Workflow run not found" });
      return;
    }

    sendJson(response, 202, { data: triggerWorkflowRun(workflow) });
    return;
  }

  if (method === "GET" && url.pathname === "/audit-logs") {
    sendJson(response, 200, { data: auditLogs });
    return;
  }

  if (method === "GET" && url.pathname === "/dead-letter-jobs") {
    sendJson(response, 200, { data: deadLetterJobs });
    return;
  }

  if (workflowId && method === "GET") {
    const workflow = workflows.get(workflowId);

    if (!workflow) {
      sendJson(response, 404, { error: "Workflow not found" });
      return;
    }

    sendJson(response, 200, { data: workflow });
    return;
  }

  if (workflowId && method === "PUT") {
    const workflow = workflows.get(workflowId);

    if (!workflow) {
      sendJson(response, 404, { error: "Workflow not found" });
      return;
    }

    try {
      const input = await readJsonBody<UpdateWorkflowInput>(request);

      if (
        input.name !== undefined &&
        (typeof input.name !== "string" || input.name.trim().length === 0)
      ) {
        sendJson(response, 400, { error: "Workflow name must be a non-empty string" });
        return;
      }

      if (input.description !== undefined && typeof input.description !== "string") {
        sendJson(response, 400, { error: "Workflow description must be a string" });
        return;
      }

      if (input.graph !== undefined && !isWorkflowGraph(input.graph)) {
        sendJson(response, 400, { error: "Workflow graph must include nodes and edges arrays" });
        return;
      }

      const updatedWorkflow: Workflow = {
        ...workflow,
        name: input.name?.trim() ?? workflow.name,
        description: input.description ?? workflow.description,
        graph: input.graph ?? workflow.graph,
        updatedAt: new Date().toISOString(),
      };

      workflows.set(updatedWorkflow.id, updatedWorkflow);
      logAudit("WORKFLOW_UPDATED", "Workflow updated", { workflowId: updatedWorkflow.id });
      sendJson(response, 200, { data: updatedWorkflow });
    } catch {
      sendJson(response, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  if (workflowId && method === "DELETE") {
    const deleted = workflows.delete(workflowId);

    if (!deleted) {
      sendJson(response, 404, { error: "Workflow not found" });
      return;
    }

    logAudit("WORKFLOW_DELETED", "Workflow deleted", { workflowId });
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { error: "Not Found" });
});

server.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
