import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { TasksRepository } from './tasks.repository';
import { TaskState } from './task-types';

interface WebhookPayload {
  task_id: string;
  state: TaskState;
  exit_code: number | null;
  error_message: string | null;
}

const RETRY_DELAYS_MS = [1000, 5000, 30000];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly tasksRepository: TasksRepository) {}

  /**
   * Fire-and-forget delivery on task finalization. Looks up the persisted
   * webhook config by task id, retries on failure with exponential backoff,
   * and records the final HTTP status (or 0 for network errors) back to the
   * task row. Errors never propagate — webhook problems must not block task
   * finalization.
   */
  fire(taskId: string, payload: WebhookPayload): void {
    const webhook = this.tasksRepository.findWebhook(taskId);
    if (!webhook) return;

    // Don't await — let task finalization complete immediately.
    void this.deliverWithRetries(taskId, webhook.url, webhook.secret, payload);
  }

  private async deliverWithRetries(
    taskId: string,
    url: string,
    secret: string | null,
    payload: WebhookPayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'llm-remote-runner/1.0',
    };
    if (secret) {
      const sig = createHmac('sha256', secret).update(body).digest('hex');
      headers['X-Runner-Signature'] = `sha256=${sig}`;
    }

    let lastStatus = 0;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
      if (attempt > 0) {
        await sleep(RETRY_DELAYS_MS[attempt - 1]);
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        lastStatus = response.status;
        if (response.ok) {
          this.logger.log(
            `Webhook delivered for task ${taskId} (${lastStatus}) on attempt ${attempt + 1}`,
          );
          break;
        }
        this.logger.warn(
          `Webhook for task ${taskId} returned ${lastStatus} on attempt ${attempt + 1}`,
        );
      } catch (err) {
        lastStatus = 0;
        this.logger.warn(
          `Webhook for task ${taskId} failed on attempt ${attempt + 1}: ${String(err)}`,
        );
      }
    }

    try {
      this.tasksRepository.updateWebhookStatus(
        taskId,
        lastStatus,
        new Date().toISOString(),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to record webhook status for task ${taskId}: ${String(err)}`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
