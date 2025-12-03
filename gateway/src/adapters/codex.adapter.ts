/**
 * Codex CLI Adapter
 *
 * Handles command building for OpenAI's Codex CLI (GPT-5 access).
 * Uses `codex exec --full-auto` for autonomous execution.
 */

import {
  CliBackend,
  CliCommandOptions,
  CliConfig,
  CliInvocation,
} from './cli-adapter.interface';
import { BaseCliAdapter } from './base-cli.adapter';

/**
 * Default configuration for Codex CLI
 */
export const DEFAULT_CODEX_CONFIG: CliConfig = {
  binPath: 'codex',
  defaultTimeoutMs: 300000, // 5 minutes - Codex tasks can be long-running
};

/**
 * Adapter for OpenAI Codex CLI
 */
export class CodexAdapter extends BaseCliAdapter {
  readonly backend: CliBackend = 'codex';
  readonly displayName = 'Codex CLI (GPT-5)';

  constructor(config: Partial<CliConfig> = {}) {
    super({ ...DEFAULT_CODEX_CONFIG, ...config });
  }

  /**
   * Build the codex exec command
   *
   * @example
   * codex exec --full-auto --skip-git-repo-check -C /path/to/workspace "prompt"
   */
  buildCommand(options: CliCommandOptions): CliInvocation {
    const args = ['exec', '--full-auto', '--skip-git-repo-check'];

    // Add working directory if specified
    if (options.cwd) {
      args.push('-C', options.cwd);
    }

    // Add the prompt as the final argument
    args.push(options.prompt);

    return {
      command: this.config.binPath,
      args,
    };
  }
}
