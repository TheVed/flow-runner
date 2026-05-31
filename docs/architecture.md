# Architecture

FlowRunner is split into three runtime surfaces:

- `apps/api`: HTTP API for workflow CRUD, run triggering, run history, audit logs, and dead letters.
- `apps/worker`: background worker process that will consume Redis jobs.
- `apps/web`: React UI for visual workflow authoring and execution visibility.

## Execution Lifecycle

1. A workflow graph is saved with nodes and edges.
2. `POST /workflows/:id/runs` creates a workflow run.
3. The engine finds the start node and queues the first step.
4. Each step moves through `QUEUED`, `RUNNING`, and a terminal state.
5. Successful steps enqueue the next node in the graph.
6. Delay nodes schedule the next node for later execution.
7. Condition nodes choose an outgoing edge by branch.
8. Failed steps retry until their retry policy is exhausted.
9. Permanently failed steps create dead letter jobs.
10. Every important lifecycle event is written to the audit log.

## Current MVP Boundary

The current implementation uses in-memory maps so the execution model can be tested quickly. The schema in
`apps/api/db/migrations/001_initial_schema.sql` is the persistence target for the PostgreSQL integration step.

Redis will become the queue backend for delayed jobs, retries, and worker handoff.
