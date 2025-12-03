/**
 * Gemini CLI Adapter
 *
 * Handles command building for Google's Gemini CLI.
 * Uses `gemini -p "<prompt>" -m <model>` for execution.
 */

import {
  CliBackend,
  CliCommandOptions,
  CliConfig,
  CliInvocation,
} from './cli-adapter.interface';
import { BaseCliAdapter } from './base-cli.adapter';

/**
 * Default configuration for Gemini CLI
 */
export const DEFAULT_GEMINI_CONFIG: CliConfig = {
  binPath: 'gemini',
  defaultModel: 'gemini-2.5-pro',
  defaultTimeoutMs: 180000, // 3 minutes
};

/**
 * Adapter for Google Gemini CLI
 */
export class GeminiCliAdapter extends BaseCliAdapter {
  readonly backend: CliBackend = 'gemini-cli';
  readonly displayName = 'Gemini CLI';

  constructor(config: Partial<CliConfig> = {}) {
    super({ ...DEFAULT_GEMINI_CONFIG, ...config });
  }

  /**
   * Build the gemini command
   *
   * @example
   * gemini -p "prompt" -m gemini-2.5-pro
   */
  buildCommand(options: CliCommandOptions): CliInvocation {
    const model = options.model ?? this.config.defaultModel ?? 'gemini-2.5-pro';

    const args = ['-p', options.prompt, '-m', model];

    return {
      command: this.config.binPath,
      args,
    };
  }
}
