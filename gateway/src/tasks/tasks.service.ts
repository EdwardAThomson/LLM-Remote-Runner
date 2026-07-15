import {
  BadRequestException,
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { ReplaySubject } from 'rxjs';
import {
  AdapterFactory,
  AnyBackend,
  ApiAdapterFactory,
  ApiBackend,
  CliAdapter,
} from '../adapters';
import { ChatMessage } from '../adapters/chat-message';
import { CreateTaskDto } from './dto/create-task.dto';
import { buildSubprocessEnv } from './subprocess-env';
import { resolveAllowedCwd } from './workspace.validator';
import { TasksRepository } from './tasks.repository';
import { WebhooksService } from './webhooks.service';
import {
  TaskDetail,
  TaskLogEvent,
  TaskState,
  TaskSummary,
} from './task-types';

/** Internal-only extras for `create()`. Not exposed via the public DTO. */
export interface CreateTaskInternal {
  /** Full chat transcript passed to the adapter (multi-turn convos). */
  messages?: ChatMessage[];
  /** Conversation this task belongs to, persisted on the task row. */
  conversationId?: string;
  /** Parent task (e.g. for branched conversations — unused for now). */
  parentTaskId?: string;
  /** Override systemPrompt for API adapters (used when the conversation has one). */
  systemPrompt?: string;
}

export { TaskDetail, TaskLogEvent, TaskState, TaskSummary } from './task-types';

interface TaskRecord extends TaskDetail {
  process?: ChildProcessWithoutNullStreams;
  cliAdapter?: CliAdapter;
  displayName: string;
  stream: ReplaySubject<MessageEvent>;
  buffers: {
    stdout: string;
    stderr: string;
  };
  finalized: boolean;
  heartbeat?: NodeJS.Timeout;
  abortController?: AbortController;
  finalizeOptions?: {
    stateOverride?: TaskState;
    messageOverride?: string | null;
  };
  /** Full chat transcript (multi-turn conversations). Adapter prefers this over `prompt`. */
  messages?: ChatMessage[];
}

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly heartbeatIntervalMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly adapterFactory: AdapterFactory,
    private readonly apiAdapterFactory: ApiAdapterFactory,
    private readonly tasksRepository: TasksRepository,
    private readonly webhooksService: WebhooksService,
  ) {
    const interval =
      this.configService.get<number>('app.taskHeartbeatMs', 15000) ?? 15000;
    this.heartbeatIntervalMs = Math.max(0, interval);
  }

  onModuleInit(): void {
    const now = new Date().toISOString();
    const interrupted = this.tasksRepository.markInterruptedAsError(now);
    if (interrupted.length > 0) {
      this.logger.warn(
        `Marked ${interrupted.length} interrupted task(s) as error on boot`,
      );
    }
  }

  /**
   * Check if a backend is an API backend
   */
  private isApiBackend(backend: AnyBackend): boolean {
    return ApiAdapterFactory.isApiBackend(backend);
  }

  async create(
    dto: CreateTaskDto,
    internal: CreateTaskInternal = {},
  ): Promise<TaskSummary> {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Determine backend (use default if not specified)
    const defaultBackend = this.configService.get<AnyBackend>('app.defaultBackend', 'codex');
    const backend = dto.backend ?? defaultBackend;

    // Resolve and validate the workspace before doing any other work. API
    // backends do not spawn a subprocess, so cwd is informational only and we
    // skip the filesystem check for them.
    let cwd: string | null;
    if (this.isApiBackend(backend)) {
      cwd = dto.cwd?.trim() ? dto.cwd.trim() : null;
    } else {
      const defaultWorkspace = this.configService.get<string>('app.defaultWorkspace');
      const allowedWorkspaces =
        this.configService.get<string[]>('app.allowedWorkspaces', []) ?? [];
      cwd = await resolveAllowedCwd(dto.cwd, {
        defaultWorkspace: defaultWorkspace ?? '',
        allowedWorkspaces,
      });
    }
    
    // Get adapter info based on backend type. While we're here, snapshot the
    // *effective* model: if the caller didn't override it, fall back to the
    // adapter's configured default. This keeps the transcript honest — a
    // Gemini turn says "gemini-3-flash-preview" instead of "—" even when the
    // user accepted the default. Codex / Claude CLI have no model knob and
    // their adapters return undefined, so those stay null.
    let cliAdapter: CliAdapter | undefined;
    let displayName: string;
    let adapterDefaultModel: string | undefined;

    if (this.isApiBackend(backend)) {
      const apiAdapter = this.apiAdapterFactory.getAdapter(backend as ApiBackend);
      displayName = apiAdapter.displayName;
      adapterDefaultModel = apiAdapter.getDefaultModel();
    } else {
      cliAdapter = this.adapterFactory.getAdapter(backend as 'codex' | 'claude-cli' | 'gemini-cli');
      displayName = cliAdapter.displayName;
      adapterDefaultModel = cliAdapter.getDefaultModel?.();
    }

    const dtoModel = dto.model?.trim();
    const effectiveModel = dtoModel || adapterDefaultModel || null;

    const record: TaskRecord = {
      id,
      prompt: dto.prompt,
      cwd,
      backend,
      model: effectiveModel,
      state: 'queued',
      exitCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      logs: [],
      cliAdapter,
      displayName,
      stream: new ReplaySubject<MessageEvent>(),
      buffers: { stdout: '', stderr: '' },
      finalized: false,
      messages: internal.messages,
      conversationId: internal.conversationId ?? null,
    };
    this.tasks.set(id, record);

    const webhookUrl = dto.webhookUrl?.trim();
    this.tasksRepository.insert(this.toSummary(record), {
      webhook: webhookUrl
        ? { url: webhookUrl, secret: dto.webhookSecret?.trim() || null }
        : null,
      conversationId: internal.conversationId ?? null,
      parentTaskId: internal.parentTaskId ?? null,
    });

    this.pushStatus(record, 'queued');

    // Run task based on backend type
    if (this.isApiBackend(backend)) {
      this.runApiTask(record, internal.systemPrompt ?? dto.systemPrompt);
    } else {
      this.runCliTask(record);
    }

    return this.toSummary(record);
  }

  async findAll(opts: {
    limit?: number;
    cursor?: string;
    backend?: string;
    state?: string;
  } = {}): Promise<{ items: TaskSummary[]; next_cursor: string | null }> {
    const limit = clamp(opts.limit ?? 50, 1, 200);
    const cursor = opts.cursor ? decodeCursor(opts.cursor) : undefined;

    const rows = this.tasksRepository.listSummaries({
      limit: limit + 1,
      cursor: cursor ?? undefined,
      backend: opts.backend,
      state: opts.state,
    });

    let next_cursor: string | null = null;
    let items = rows;
    if (rows.length > limit) {
      items = rows.slice(0, limit);
      const last = items[items.length - 1];
      next_cursor = encodeCursor({ createdAt: last.createdAt, id: last.id });
    }

    return { items, next_cursor };
  }

  async deleteTaskById(id: string): Promise<void> {
    const live = this.tasks.get(id);
    if (live && !live.finalized) {
      throw new BadRequestException(
        `Task ${id} is still running. Cancel it before deleting.`,
      );
    }
    const persisted = this.tasksRepository.findSummary(id);
    if (!persisted && !live) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    this.tasksRepository.deleteTask(id);
    this.tasks.delete(id);
  }

  async findDetailOrFail(id: string): Promise<TaskDetail> {
    const live = this.tasks.get(id);
    if (live) {
      return this.toDetail(live);
    }
    const persisted = this.tasksRepository.findDetail(id);
    if (!persisted) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return persisted;
  }

  async streamTask(id: string): Promise<ReplaySubject<MessageEvent>> {
    const task = this.tasks.get(id);
    if (!task) {
      const persisted = this.tasksRepository.findDetail(id);
      if (!persisted) {
        throw new NotFoundException(`Task ${id} not found`);
      }
      return this.synthesizePersistedStream(persisted);
    }

    if (!task.finalized && task.stream.observers.length > 0) {
      return task.stream;
    }

    return this.replayTaskStream(task);
  }

  async cancelTask(
    id: string,
    reason = 'Task canceled by user',
  ): Promise<TaskDetail> {
    const task = this.tasks.get(id);
    if (!task) {
      const persisted = this.tasksRepository.findDetail(id);
      if (!persisted) {
        throw new NotFoundException(`Task ${id} not found`);
      }
      if (persisted.state === 'queued' || persisted.state === 'running') {
        // Shouldn't happen under normal operation — boot hydration converts these
        // to error. Treat as a no-op.
        throw new BadRequestException(`Task ${id} is not active`);
      }
      return persisted;
    }

    if (task.finalized) {
      return this.toDetail(task);
    }

    if (task.state !== 'queued' && task.state !== 'running') {
      throw new BadRequestException(`Task ${id} is not active`);
    }

    this.logger.log(`Canceling task ${id}`);
    task.finalizeOptions = {
      stateOverride: 'canceled',
      messageOverride: reason,
    };
    this.stopHeartbeat(task);

    if (task.process && !task.process.killed) {
      try {
        task.process.kill('SIGTERM');
      } catch (error) {
        this.logger.warn(`Failed to terminate task ${id}: ${String(error)}`);
      }
    }

    if (!task.finalized) {
      this.finalizeTask(task, null, task.finalizeOptions);
    }

    return this.toDetail(task);
  }

  /**
   * Run a CLI-based task
   */
  private runCliTask(task: TaskRecord) {
    if (!task.cliAdapter) {
      this.logger.error(`No CLI adapter for task ${task.id}`);
      this.finalizeTask(task, null, { error: new Error('No CLI adapter configured') });
      return;
    }
    
    const cwd = task.cwd ?? process.cwd();
    
    // Use the adapter to build the command. If we have a multi-turn transcript,
    // the adapter serializes it into a single prompt string before invocation.
    const invocation = task.cliAdapter.buildCommand({
      prompt: task.prompt,
      cwd,
      model: task.model ?? undefined,
      messages: task.messages,
    });

    this.logger.log(
      `Starting ${task.displayName} task ${task.id}: ${invocation.command} ${invocation.args.join(' ').substring(0, 100)}...`,
    );

    const extraSubprocessEnv =
      this.configService.get<string[]>('app.extraSubprocessEnv', []) ?? [];
    const subprocessEnv = buildSubprocessEnv({
      extra: extraSubprocessEnv,
      adapterEnv: invocation.env,
    });

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(invocation.command, invocation.args, {
        cwd, // Set working directory for CLIs that don't have a -C flag
        env: subprocessEnv,
        stdio: 'pipe',
      });
    } catch (error) {
      this.logger.error(
        `Failed to spawn ${task.displayName} process for task ${task.id}: ${String(error)}`,
      );
      const options = task.finalizeOptions
        ? { ...task.finalizeOptions }
        : { error: error as Error };
      this.finalizeTask(task, null, options);
      return;
    }

    task.process = child;
    this.pushStatus(task, 'running');
    this.startHeartbeat(task);

    child.stdout.on('data', (chunk: Buffer) => {
      this.handleOutput(task, chunk, 'stdout');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      this.handleOutput(task, chunk, 'stderr');
    });

    child.once('error', (error) => {
      this.flushBuffers(task);
      this.logger.error(
        `${task.displayName} process error for task ${task.id}: ${String(error)}`,
      );
      const options = task.finalizeOptions
        ? { ...task.finalizeOptions }
        : { error };
      this.finalizeTask(task, null, options);
    });

    child.once('close', (code) => {
      this.flushBuffers(task);
      const options = task.finalizeOptions
        ? { ...task.finalizeOptions }
        : { error: code === 0 ? null : undefined };
      this.finalizeTask(task, code ?? null, options);
    });
  }

  /**
   * Run an API-based task with streaming
   */
  private async runApiTask(task: TaskRecord, systemPrompt?: string) {
    const apiBackend = task.backend as ApiBackend;
    
    try {
      const adapter = this.apiAdapterFactory.getAdapter(apiBackend);
      
      this.logger.log(`Starting ${task.displayName} task ${task.id}`);
      
      task.abortController = new AbortController();
      this.pushStatus(task, 'running');
      this.startHeartbeat(task);
      
      // Stream the response. When the task carries a multi-turn transcript,
      // the adapter sends it through natively (Chat Completions / Messages API).
      const stream = adapter.stream({
        prompt: task.prompt,
        model: task.model ?? undefined,
        systemPrompt,
        messages: task.messages,
      });
      
      let fullContent = '';
      
      for await (const chunk of stream) {
        // Check if task was canceled
        if (task.finalizeOptions?.stateOverride === 'canceled') {
          break;
        }
        
        if (chunk.content) {
          fullContent += chunk.content;
          // Stream each chunk as a log line
          this.appendLog(task, chunk.content, 'stdout');
        }
        
        if (chunk.done) {
          if (chunk.usage) {
            this.appendLog(
              task,
              `\n[Tokens: ${chunk.usage.promptTokens} prompt, ${chunk.usage.completionTokens} completion, ${chunk.usage.totalTokens} total]`,
              'stderr',
            );
          }
          break;
        }
      }
      
      // Finalize based on whether we were canceled or completed
      if (task.finalizeOptions?.stateOverride === 'canceled') {
        this.finalizeTask(task, null, task.finalizeOptions);
      } else {
        this.finalizeTask(task, 0, {});
      }
    } catch (error) {
      this.logger.error(
        `${task.displayName} API error for task ${task.id}: ${String(error)}`,
      );
      const options = task.finalizeOptions
        ? { ...task.finalizeOptions }
        : { error: error as Error };
      this.finalizeTask(task, null, options);
    }
  }

  private handleOutput(
    task: TaskRecord,
    chunk: Buffer,
    stream: 'stdout' | 'stderr',
  ) {
    const text = chunk.toString('utf8');
    const combined = task.buffers[stream] + text;
    const lines = combined.split(/\r?\n/);
    task.buffers[stream] = lines.pop() ?? '';

    for (const line of lines) {
      this.appendLog(task, line, stream);
    }
  }

  private flushBuffers(task: TaskRecord) {
    const stdoutRemainder = task.buffers.stdout;
    const stderrRemainder = task.buffers.stderr;

    if (stdoutRemainder.length > 0) {
      this.appendLog(task, stdoutRemainder, 'stdout');
      task.buffers.stdout = '';
    }

    if (stderrRemainder.length > 0) {
      this.appendLog(task, stderrRemainder, 'stderr');
      task.buffers.stderr = '';
    }
  }

  private appendLog(
    task: TaskRecord,
    line: string,
    stream: 'stdout' | 'stderr',
  ) {
    const timestamp = new Date().toISOString();
    const entry: TaskLogEvent = { line, stream, ts: timestamp };
    task.logs.push(entry);
    try {
      this.tasksRepository.appendLog(task.id, entry);
    } catch (error) {
      this.logger.warn(
        `Failed to persist log for task ${task.id}: ${String(error)}`,
      );
    }
    task.stream.next({
      type: 'log',
      data: entry,
    });
  }

  private pushStatus(task: TaskRecord, state: TaskState, error?: string | null) {
    task.state = state;
    task.errorMessage = error ?? null;
    const now = new Date();
    task.updatedAt = now.toISOString();

    try {
      this.tasksRepository.updateState(
        task.id,
        state,
        task.errorMessage,
        task.updatedAt,
        task.exitCode,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to persist state for task ${task.id}: ${String(err)}`,
      );
    }

    const event = this.toStatusEvent(state, task.errorMessage ?? undefined, now);
    task.stream.next({
      type: 'status',
      data: event,
    });
  }

  private finalizeTask(
    task: TaskRecord,
    exitCode: number | null,
    options: {
      error?: Error | null;
      stateOverride?: TaskState;
      messageOverride?: string | null;
    } = {},
  ) {
    if (task.finalized) {
      return;
    }

    task.finalized = true;
    task.exitCode = exitCode;
    this.stopHeartbeat(task);
    const { error, stateOverride, messageOverride } = options;

    let targetState: TaskState;
    if (stateOverride) {
      targetState = stateOverride;
    } else {
      const hasError = exitCode === null || exitCode !== 0 || error;
      targetState = hasError ? 'error' : 'completed';
    }

    let message = messageOverride ?? undefined;
    if (!message) {
      message =
        error?.message ??
        (targetState === 'error' ? `${task.displayName} execution failed` : undefined);
    }

    this.pushStatus(task, targetState, message);
    task.finalizeOptions = undefined;

    task.stream.next({
      type: 'done',
      data: {
        exit_code: exitCode ?? -1,
        state: targetState,
      },
    });
    task.stream.complete();

    this.webhooksService.fire(task.id, {
      task_id: task.id,
      state: targetState,
      exit_code: exitCode,
      error_message: task.errorMessage,
    });
  }

  private replayTaskStream(task: TaskRecord): ReplaySubject<MessageEvent> {
    const stream = new ReplaySubject<MessageEvent>();
    const statusEvent = this.toStatusEvent(
      task.state,
      task.errorMessage ?? undefined,
      new Date(task.updatedAt),
    );
    stream.next({ type: 'status', data: statusEvent });

    for (const log of task.logs) {
      stream.next({ type: 'log', data: log });
    }

    if (task.finalized) {
      stream.next({
        type: 'done',
        data: {
          exit_code: task.exitCode ?? -1,
          state: task.state,
        },
      });
      stream.complete();
    }

    task.stream = stream;
    return stream;
  }

  private synthesizePersistedStream(
    detail: TaskDetail,
  ): ReplaySubject<MessageEvent> {
    const stream = new ReplaySubject<MessageEvent>();
    stream.next({
      type: 'status',
      data: this.toStatusEvent(
        detail.state,
        detail.errorMessage ?? undefined,
        new Date(detail.updatedAt),
      ),
    });
    for (const log of detail.logs) {
      stream.next({ type: 'log', data: log });
    }
    stream.next({
      type: 'done',
      data: { exit_code: detail.exitCode ?? -1, state: detail.state },
    });
    stream.complete();
    return stream;
  }

  private toStatusEvent(state: TaskState, error?: string, timestamp = new Date()) {
    return {
      state,
      ts: timestamp.toISOString(),
      ...(error ? { error } : {}),
    };
  }

  private toSummary(task: TaskRecord): TaskSummary {
    return {
      id: task.id,
      prompt: task.prompt,
      cwd: task.cwd,
      backend: task.backend,
      model: task.model,
      state: task.state,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      exitCode: task.exitCode,
      errorMessage: task.errorMessage,
      conversationId: task.conversationId ?? null,
    };
  }

  private toDetail(task: TaskRecord): TaskDetail {
    return {
      ...this.toSummary(task),
      logs: task.logs,
    };
  }

  private startHeartbeat(task: TaskRecord) {
    if (this.heartbeatIntervalMs <= 0) {
      return;
    }

    this.stopHeartbeat(task);

    task.heartbeat = setInterval(() => {
      const now = new Date().toISOString();
      task.stream.next({
        type: 'heartbeat',
        data: { ts: now },
      });
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(task: TaskRecord) {
    if (task.heartbeat) {
      clearInterval(task.heartbeat);
      task.heartbeat = undefined;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function encodeCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(
  raw: string,
): { createdAt: string; id: string } | undefined {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed?.createdAt === 'string' &&
      typeof parsed?.id === 'string'
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // fall through
  }
  return undefined;
}
