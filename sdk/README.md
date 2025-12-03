# @codex/sdk

TypeScript SDK shared by the web and mobile clients. Wraps REST and SSE helpers exposed by the Codex gateway.

## Usage

```ts
import { cancelTask, createTask, streamTask } from '@codex/sdk';

const baseUrl = 'http://localhost:3000';
const task = await createTask(baseUrl, { prompt: 'Hello Codex' });
const dispose = streamTask(baseUrl, task.task_id, {
  onLog: (event) => console.log(event.line),
  onHeartbeat: (event) => console.debug('heartbeat', event.ts),
  onDone: (event) => console.log(`task finished with state ${event.state}`),
});

// later …
await cancelTask(baseUrl, task.task_id, 'No longer needed');
dispose();
```

Callers running outside the browser (Node/React Native) should supply a custom `eventSourceFactory` to provide SSE support. Heartbeat events are emitted periodically (default 15s) and can be ignored if not required.
