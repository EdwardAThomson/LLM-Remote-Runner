import { ConfigService } from '@nestjs/config';
import { MessageEvent } from '@nestjs/common';
import {
  ChildProcessWithoutNullStreams,
  spawn,
} from 'child_process';
import { EventEmitter } from 'events';
import { TasksService } from '../src/tasks/tasks.service';
import {
  AdapterFactory,
  ApiAdapterFactory,
  CodexAdapter,
} from '../src/adapters';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
}));

function createConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    'app.codexBinPath': '/usr/bin/fake-codex',
    'app.claudeBinPath': '/usr/bin/fake-claude',
    'app.geminiBinPath': '/usr/bin/fake-gemini',
    'app.geminiDefaultModel': 'gemini-2.5-pro',
    'app.defaultBackend': 'codex',
    'app.taskHeartbeatMs': 0,
    'app.defaultWorkspace': '/tmp/workspace',
  };
  const values = { ...defaults, ...overrides };
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue,
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
  let configService: ConfigService;
  let adapterFactory: AdapterFactory;
  let apiAdapterFactory: ApiAdapterFactory;

  beforeEach(() => {
    spawnMock.mockReset();
    configService = createConfigService();
    adapterFactory = new AdapterFactory(configService);
    apiAdapterFactory = { getAdapter: jest.fn() } as unknown as ApiAdapterFactory;
    service = new TasksService(configService, adapterFactory, apiAdapterFactory);
  });

  it('spawns Codex via the adapter, streams logs, and persists task history', async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const summary = await service.create({ prompt: 'demo task' });

    expect(summary.backend).toBe('codex');
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [bin, args] = spawnMock.mock.calls[0];
    expect(bin).toBe('/usr/bin/fake-codex');
    expect(args).toEqual([
      'exec',
      '--full-auto',
      '--skip-git-repo-check',
      '-C',
      '/tmp/workspace',
      'demo task',
    ]);

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

  it('routes claude-cli requests to the Claude adapter', async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    const summary = await service.create({
      prompt: 'hello claude',
      backend: 'claude-cli',
    });

    expect(summary.backend).toBe('claude-cli');
    const [bin, args] = spawnMock.mock.calls[0];
    expect(bin).toBe('/usr/bin/fake-claude');
    expect(args).toEqual(['-p', 'hello claude', '--output-format', 'json']);
  });

  it('routes gemini-cli requests with the configured default model', async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    await service.create({
      prompt: 'hello gemini',
      backend: 'gemini-cli',
    });

    const [bin, args] = spawnMock.mock.calls[0];
    expect(bin).toBe('/usr/bin/fake-gemini');
    expect(args).toEqual(['-p', 'hello gemini', '-m', 'gemini-2.5-pro']);
  });
});
