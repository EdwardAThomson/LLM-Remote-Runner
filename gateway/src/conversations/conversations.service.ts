import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AnyBackend, ChatMessage } from '../adapters';
import { TasksService } from '../tasks/tasks.service';
import { ConversationsRepository } from './conversations.repository';
import {
  ConversationDetail,
  ConversationSummary,
  MessageRecord,
} from './conversation-types';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

export interface SendMessageResult {
  message_id: string;
  task_id: string;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly repo: ConversationsRepository,
    private readonly tasksService: TasksService,
  ) {}

  // ---- CRUD ----------------------------------------------------------------

  create(dto: CreateConversationDto): ConversationSummary {
    const now = new Date().toISOString();
    const record: ConversationSummary = {
      id: randomUUID(),
      title: dto.title?.trim() || null,
      systemPrompt: dto.systemPrompt?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    this.repo.insertConversation(record);
    return record;
  }

  list(opts: { limit?: number; cursor?: string }): {
    items: ConversationSummary[];
    next_cursor: string | null;
  } {
    const limit = clamp(opts.limit ?? 50, 1, 200);
    const cursor = opts.cursor ? decodeCursor(opts.cursor) : undefined;
    const rows = this.repo.listConversations({
      limit: limit + 1,
      cursor: cursor ?? undefined,
    });
    let next_cursor: string | null = null;
    let items = rows;
    if (rows.length > limit) {
      items = rows.slice(0, limit);
      const last = items[items.length - 1];
      next_cursor = encodeCursor({ updatedAt: last.updatedAt, id: last.id });
    }
    return { items, next_cursor };
  }

  findDetailOrFail(id: string): ConversationDetail {
    const detail = this.repo.findDetail(id);
    if (!detail) throw new NotFoundException(`Conversation ${id} not found`);
    return detail;
  }

  update(id: string, dto: UpdateConversationDto): ConversationSummary {
    const existing = this.repo.findConversation(id);
    if (!existing) throw new NotFoundException(`Conversation ${id} not found`);
    if (dto.title === undefined && dto.systemPrompt === undefined) {
      throw new BadRequestException('Provide title and/or systemPrompt');
    }
    const patch: { title?: string | null; systemPrompt?: string | null } = {};
    if (dto.title !== undefined) {
      patch.title = dto.title === null ? null : dto.title.trim() || null;
    }
    if (dto.systemPrompt !== undefined) {
      patch.systemPrompt =
        dto.systemPrompt === null ? null : dto.systemPrompt.trim() || null;
    }
    this.repo.updateConversation(id, patch, new Date().toISOString());
    return this.repo.findConversation(id)!;
  }

  delete(id: string): void {
    const existing = this.repo.findConversation(id);
    if (!existing) throw new NotFoundException(`Conversation ${id} not found`);
    this.repo.deleteConversation(id);
  }

  // ---- The interesting one: send a message and produce an assistant turn ----

  async sendMessage(
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<SendMessageResult> {
    const conv = this.repo.findConversation(conversationId);
    if (!conv) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    // 1. Persist the user message.
    const now = new Date().toISOString();
    const userMessage: MessageRecord = {
      id: randomUUID(),
      conversationId,
      role: 'user',
      content: dto.content,
      taskId: null,
      backend: null,
      model: null,
      createdAt: now,
    };
    this.repo.insertMessage(userMessage);
    this.repo.touchUpdatedAt(conversationId, now);

    // 2. If the conversation has no title yet, derive one from the first user
    //    message. Cheap UX win: dashboards get a readable label automatically.
    if (!conv.title) {
      this.repo.updateConversation(
        conversationId,
        { title: deriveTitle(dto.content) },
        now,
      );
    }

    // 3. Assemble the transcript for the adapter. The conversation-level
    //    system prompt is the source of truth; per-turn DTOs don't carry one.
    const history = this.repo.listMessages(conversationId);
    const transcript: ChatMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 4. Create the task carrying that transcript. The adapter prefers the
    //    transcript over the bare prompt; we still pass `prompt` as the new
    //    user content for adapters that fall back to it.
    let task;
    try {
      task = await this.tasksService.create(
        {
          prompt: dto.content,
          backend: dto.backend,
          model: dto.model,
          cwd: dto.cwd,
        },
        {
          messages: transcript,
          conversationId,
          systemPrompt: conv.systemPrompt ?? undefined,
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to create task for conversation ${conversationId}: ${String(err)}`,
      );
      throw err;
    }

    // 5. Subscribe to the task's stream so we can capture stdout into the
    //    assistant message when the task finalizes. Fire-and-forget; the
    //    user's request returns as soon as the task is queued.
    this.attachAssistantWriter(
      conversationId,
      task.id,
      task.backend,
      task.model ?? null,
    );

    return { message_id: userMessage.id, task_id: task.id };
  }

  private async attachAssistantWriter(
    conversationId: string,
    taskId: string,
    backend: AnyBackend,
    model: string | null,
  ): Promise<void> {
    let stream;
    try {
      stream = await this.tasksService.streamTask(taskId);
    } catch (err) {
      this.logger.warn(
        `Could not attach to task ${taskId} for conversation ${conversationId}: ${String(err)}`,
      );
      return;
    }

    let buffer = '';

    stream.subscribe({
      next: (event: any) => {
        if (
          event?.type === 'log' &&
          event?.data?.stream === 'stdout' &&
          typeof event.data.line === 'string'
        ) {
          buffer += event.data.line + '\n';
        }
      },
      complete: () => {
        const content = buffer.trim();
        const finalizedAt = new Date().toISOString();
        try {
          this.repo.insertMessage({
            id: randomUUID(),
            conversationId,
            role: 'assistant',
            content,
            taskId,
            backend,
            model,
            createdAt: finalizedAt,
          });
          this.repo.touchUpdatedAt(conversationId, finalizedAt);
        } catch (err) {
          this.logger.error(
            `Failed to persist assistant message for task ${taskId}: ${String(err)}`,
          );
        }
      },
      error: (err) => {
        this.logger.warn(
          `Stream error for task ${taskId}: ${String(err)} (no assistant message written)`,
        );
      },
    });
  }
}

function deriveTitle(content: string): string {
  const trimmed = content.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + '…';
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function encodeCursor(cursor: { updatedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(
  raw: string,
): { updatedAt: string; id: string } | undefined {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed?.updatedAt === 'string' &&
      typeof parsed?.id === 'string'
    ) {
      return { updatedAt: parsed.updatedAt, id: parsed.id };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
