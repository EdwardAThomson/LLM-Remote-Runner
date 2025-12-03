import { ConfigService } from '@nestjs/config';
import { MessageEvent } from '@nestjs/common';
import {
  ChildProcessWithoutNullStreams,
  spawn,
} from 'child_process';
import { EventEmitter } from 'events';
import { TasksService } from '../src/tasks/tasks.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

function createConfigService(): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) => {
      if (key === 'app.codexBinPath') {
        return '/usr/bin/fake-codex';
      }

      return defaultValue;
    },
  } as unknown as ConfigService;
}

function createChildProcess(): ChildProcessWithoutNullStreams {
  const emitter = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(emitter, {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    killed: false,
    kill: jest.fn(() => {
      (emitter as any).killed = true;
      (emitter as any).emit('close', null);
      return true;
    }),
  });
  return emitter;
}

async function flushMicrotasks() {
  await Promise.resolve();
}

describe('TasksService', () => {
  const spawnMock = spawn as jest.Mock;
  let service: TasksService;

  beforeEach(() => {
    spawnMock.mockReset();

    service = new TasksService(createConfigService());
  });

  it('spawns Codex, streams logs, and persists task history', async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const summary = await service.create({ prompt: 'demo task' });

    expect(spawnMock).toHaveBeenCalledWith('/usr/bin/fake-codex', [
      'exec',
      '--prompt',
      'demo task',
    ], expect.any(Object));

    const stream = await service.streamTask(summary.id);
    const events: MessageEvent[] = [];
    stream.subscribe((event) => events.push(event));

    await flushMicrotasks();

    (child.stdout as EventEmitter).emit('data', Buffer.from('line 1\nline 2\n'));
    child.emit('close', 0);

    await flushMicrotasks();
    await flushMicrotasks();

    const significantEvents = events.filter((event) => event.type !== 'heartbeat');
    const eventTypes = significantEvents.map((event) => event.type);
    expect(eventTypes.filter((value) => value === 'status').length).toBeGreaterThanOrEqual(2);
    expect(eventTypes).toContain('log');
    expect(eventTypes).toContain('done');

    const logEvents = significantEvents.filter((event) => event.type === 'log');
    const lines = logEvents.map((event) => (event as any).data.line);
    expect(lines).toEqual(['line 1', 'line 2']);

    const detail = await service.findDetailOrFail(summary.id);
    expect(detail.state).toBe('completed');
    expect(detail.exitCode).toBe(0);
    expect(detail.logs.map((log) => log.line)).toEqual(['line 1', 'line 2']);
    const doneEvent = significantEvents.find((event) => event.type === 'done');
    expect((doneEvent as any)?.data.state).toBe('completed');
  });

  it('cancels an active task and emits cancellation events', async () => {
    jest.useFakeTimers();

    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const summary = await service.create({ prompt: 'long running task' });
    const stream = await service.streamTask(summary.id);
    const events: MessageEvent[] = [];
    stream.subscribe((event) => events.push(event));

    await flushMicrotasks();

    const detail = await service.cancelTask(summary.id, 'User requested cancellation');

    await flushMicrotasks();
    jest.runOnlyPendingTimers();
    await flushMicrotasks();

    const killMock = (child as any).kill as jest.Mock;
    expect(killMock).toHaveBeenCalled();

    const statusEvents = events.filter((event) => event.type === 'status');
    expect(statusEvents.some((event) => (event as any).data.state === 'canceled')).toBe(true);

    const doneEvent = events.find((event) => event.type === 'done');
    expect((doneEvent as any)?.data.state).toBe('canceled');

    expect(detail.state).toBe('canceled');
    expect(detail.errorMessage).toBe('User requested cancellation');

    jest.useRealTimers();
  });
});
