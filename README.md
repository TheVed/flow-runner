# FlowRunner

FlowRunner is a workflow automation engine inspired by Temporal, n8n, and Airflow. It is designed as a portfolio project to demonstrate distributed systems, event-driven architecture, state machines, queues, retry handling, and platform engineering.

## Tech Stack

- Node.js
- TypeScript
- PostgreSQL
- Redis
- React

## Planned Features

- Visual workflow builder
- State-machine-based workflow execution
- Retry policies with backoff
- Delayed execution
- Dead letter queues
- Audit logs
- Workflow run history
- Worker-based asynchronous task execution

## Architecture

The project will be organized as a monorepo:

```txt
flow-runner/
  apps/
    api/
    web/
    worker/
  packages/
    shared/
```

The React frontend will let users create workflows visually. The API server will persist workflow definitions and trigger runs. Redis will handle asynchronous jobs, retries, and delays. PostgreSQL will store workflow definitions, execution state, audit logs, and dead letter records.

## Roadmap

1. Initialize monorepo structure.
2. Configure TypeScript and workspace tooling.
3. Add PostgreSQL and Redis using Docker Compose.
4. Build workflow CRUD APIs.
5. Add database schema for workflows, runs, steps, logs, and dead letters.
6. Define shared workflow graph types.
7. Build React workflow dashboard.
8. Add visual workflow builder.
9. Implement workflow triggering.
10. Add worker service for queued step execution.
11. Implement workflow and step state machines.
12. Add graph transition logic.
13. Add retry policies with backoff.
14. Support delayed execution.
15. Add dead letter queue handling.
16. Add audit logging.
17. Build run history and execution log UI.
18. Add conditional branching.
19. Support manual retry from failed steps.
20. Document architecture, setup, and screenshots.
