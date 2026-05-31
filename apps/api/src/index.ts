import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CreateWorkflowInput, UpdateWorkflowInput, Workflow } from "@flow-runner/shared";

const port = Number(process.env.PORT ?? 3000);
const workflows = new Map<string, Workflow>();

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

const isWorkflowGraph = (value: unknown): value is CreateWorkflowInput["graph"] => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const graph = value as CreateWorkflowInput["graph"];
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

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const workflowIdMatch = /^\/workflows\/([^/]+)$/.exec(url.pathname);
  const workflowId = workflowIdMatch?.[1];

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "flow-runner-api",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/workflows") {
    sendJson(response, 200, {
      data: Array.from(workflows.values()),
    });
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
      sendJson(response, 201, { data: workflow });
    } catch {
      sendJson(response, 400, { error: "Invalid JSON body" });
    }
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

    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, {
    error: "Not Found",
  });
});

server.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
