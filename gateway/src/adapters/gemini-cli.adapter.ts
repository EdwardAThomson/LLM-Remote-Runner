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
  defaultModel: 'gemini-3-flash-preview',
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

  // Gemini CLI 0.42+ refuses to run in an untrusted directory unless
  // --skip-trust is passed or GEMINI_CLI_TRUST_WORKSPACE=true is set.
  // The gateway's workspace allowlist (F-1) already constrains where CLIs run.
  /**
   * Build the gemini command
   *
   * @example
   * gemini --skip-trust -p "prompt" -m gemini-3-flash-preview
   */
  buildCommand(options: CliCommandOptions): CliInvocation {
    const model = options.model ?? this.config.defaultModel ?? 'gemini-3-flash-preview';

    const args = ['--skip-trust', '-p', this.resolvePrompt(options), '-m', model];

    return {
      command: this.config.binPath,
      args,
    };
  }
}
