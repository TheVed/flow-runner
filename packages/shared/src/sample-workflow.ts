import type { WorkflowGraph } from "./index.js";

export const sampleWorkflowGraph: WorkflowGraph = {
  nodes: [
    {
      id: "start",
      type: "task",
      name: "Start import",
      config: { message: "Import started" },
      retryPolicy: { maxAttempts: 3, backoffMs: 1000 },
    },
    {
      id: "wait",
      type: "delay",
      name: "Wait before verification",
      config: { delayMs: 500 },
    },
    {
      id: "check",
      type: "condition",
      name: "Check result",
      config: { branch: "success" },
    },
    {
      id: "success",
      type: "task",
      name: "Mark complete",
      config: { message: "Workflow completed" },
    },
  ],
  edges: [
    { id: "start-wait", from: "start", to: "wait" },
    { id: "wait-check", from: "wait", to: "check" },
    { id: "check-success", from: "check", to: "success", condition: "success" },
  ],
};
