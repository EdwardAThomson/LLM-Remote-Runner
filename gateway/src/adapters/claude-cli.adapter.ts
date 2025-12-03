/**
 * Claude Code CLI Adapter
 *
 * Handles command building for Anthropic's Claude Code CLI.
 * Uses `claude -p "<prompt>" --output-format json` for headless execution.
 * Parses JSON output to extract the result field.
 */

import {
  CliBackend,
  CliCommandOptions,
  CliConfig,
  CliInvocation,
  CliOutputResult,
} from './cli-adapter.interface';
import { BaseCliAdapter } from './base-cli.adapter';

/**
 * Default configuration for Claude CLI
 */
export const DEFAULT_CLAUDE_CONFIG: CliConfig = {
  binPath: 'claude',
  defaultTimeoutMs: 180000, // 3 minutes
};

/**
 * Adapter for Anthropic Claude Code CLI
 */
export class ClaudeCliAdapter extends BaseCliAdapter {
  readonly backend: CliBackend = 'claude-cli';
  readonly displayName = 'Claude Code CLI';

  constructor(config: Partial<CliConfig> = {}) {
    super({ ...DEFAULT_CLAUDE_CONFIG, ...config });
  }

  /**
   * Build the claude command
   *
   * @example
   * claude -p "prompt" --output-format json
   */
  buildCommand(options: CliCommandOptions): CliInvocation {
    const args = ['-p', options.prompt, '--output-format', 'json'];

    return {
      command: this.config.binPath,
      args,
      // Claude CLI uses CWD from the spawn options, not a flag
    };
  }

  /**
   * Parse Claude's JSON output to extract the result field
   *
   * Claude returns: {"result": "...content..."}
   */
  parseOutput(stdout: string): CliOutputResult {
    const trimmed = stdout.trim();

    if (!trimmed) {
      return {
        content: '',
        success: false,
        error: 'Claude CLI returned empty output',
      };
    }

    try {
      const data = JSON.parse(trimmed);

      if (typeof data === 'object' && data !== null && 'result' in data) {
        return {
          content: String(data.result),
          success: true,
        };
      }

      // If no result field, return the raw output
      return {
        content: trimmed,
        success: true,
      };
    } catch (error) {
      // JSON parsing failed - might be plain text output
      return {
        content: trimmed,
        success: true,
      };
    }
  }
}
