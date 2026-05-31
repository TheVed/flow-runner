# Worker

Background worker service for executing queued workflow steps.

Planned responsibilities:

- Consume jobs from Redis
- Execute workflow steps
- Apply retry and delay policies
- Write step results and audit logs
