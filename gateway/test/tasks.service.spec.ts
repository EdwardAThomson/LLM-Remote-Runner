import { ConfigService } from '@nestjs/config';
import { MessageEvent } from '@nestjs/common';
import {
  ChildProcessWithoutNullStreams,
  spawn,
} from 'child_process';
import { EventEmitter } from 'events';
import { mkdtemp, realpath, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TasksService } from '../src/tasks/tasks.service';
import {
  AdapterFactory,
  ApiAdapterFactory,
} from '../src/adapters';
import { TasksRepository } from '../src/tasks/tasks.repository';
import { WebhooksService } from '../src/tasks/webhooks.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
}));

function createConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    'app.codexBinPath': '/usr/bin/fake-codex',
    'app.claudeBinPath': '/usr/bin/fake-claude',
    'app.geminiBinPath': '/usr/bin/fake-gemini',
    'app.geminiDefaultModel': 'gemini-3.1-pro-preview',
    'app.defaultBackend': 'codex',
    'app.taskHeartbeatMs': 0,
    'app.allowedWorkspaces': [],
    'app.extraSubprocessEnv': [],
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
  let tasksRepository: TasksRepository;
  let webhooksService: WebhooksService;
  let workspaceRoot: string;

  beforeEach(async () => {
    spawnMock.mockReset();
    workspaceRoot = await realpath(await mkdtemp(join(tmpdir(), 'lrr-tasks-')));
    configService = createConfigService({
      'app.defaultWorkspace': workspaceRoot,
    });
    adapterFactory = new AdapterFactory(configService);
    apiAdapterFactory = { getAdapter: jest.fn() } as unknown as ApiAdapterFactory;
    tasksRepository = {
      insert: jest.fn(),
      updateState: jest.fn(),
      appendLog: jest.fn(),
      findSummary: jest.fn().mockReturnValue(null),
      findDetail: jest.fn().mockReturnValue(null),
      listSummaries: jest.fn().mockReturnValue([]),
      deleteTask: jest.fn(),
      markInterruptedAsError: jest.fn().mockReturnValue([]),
    } as unknown as TasksRepository;
    webhooksService = { fire: jest.fn() } as unknown as WebhooksService;
    service = new TasksService(
      configService,
      adapterFactory,
      apiAdapterFactory,
      tasksRepository,
      webhooksService,
    );
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
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
      workspaceRoot,
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
    expect(args).toEqual([
      '--skip-trust',
      '-p',
      'hello gemini',
      '-m',
      'gemini-3.1-pro-preview',
    ]);
  });

  it('rejects a cwd outside the allowlist (F-1)', async () => {
    await expect(
      service.create({ prompt: 'p', cwd: '/etc' }),
    ).rejects.toThrow(/not in the allowlist|does not exist|not accessible/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not forward secrets in process.env to spawned CLIs (F-3)', async () => {
    const previousEnv = { ...process.env };
    process.env.JWT_SECRET = 'jwt-leak-test';
    process.env.ADMIN_PASSWORD_HASH = 'hash-leak-test';
    process.env.OPENAI_API_KEY = 'sk-leak-test';
    try {
      const child = createChildProcess();
      spawnMock.mockReturnValue(child);

      await service.create({ prompt: 'demo task' });

      const spawnedEnv = spawnMock.mock.calls[0][2].env as Record<string, string>;
      expect(spawnedEnv).not.toHaveProperty('JWT_SECRET');
      expect(spawnedEnv).not.toHaveProperty('ADMIN_PASSWORD_HASH');
      expect(spawnedEnv).not.toHaveProperty('OPENAI_API_KEY');
      expect(spawnedEnv.PATH).toBeDefined();
    } finally {
      process.env = previousEnv;
    }
  });

  it('honors EXTRA_SUBPROCESS_ENV opt-ins (F-3)', async () => {
    process.env.MY_CUSTOM_VAR = 'forwarded-value';
    configService = createConfigService({
      'app.defaultWorkspace': workspaceRoot,
      'app.extraSubprocessEnv': ['MY_CUSTOM_VAR'],
    });
    adapterFactory = new AdapterFactory(configService);
    service = new TasksService(
      configService,
      adapterFactory,
      apiAdapterFactory,
      tasksRepository,
      webhooksService,
    );

    const child = createChildProcess();
    spawnMock.mockReturnValue(child);

    try {
      await service.create({ prompt: 'demo task' });
      const spawnedEnv = spawnMock.mock.calls[0][2].env as Record<string, string>;
      expect(spawnedEnv.MY_CUSTOM_VAR).toBe('forwarded-value');
    } finally {
      delete process.env.MY_CUSTOM_VAR;
    }
  });
});
