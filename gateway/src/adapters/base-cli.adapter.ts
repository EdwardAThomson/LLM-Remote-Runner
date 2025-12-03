/**
 * Base CLI Adapter
 *
 * Provides shared functionality for all CLI adapters including
 * binary availability checking and default output parsing.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import {
  CliAdapter,
  CliBackend,
  CliCommandOptions,
  CliConfig,
  CliInvocation,
  CliOutputResult,
} from './cli-adapter.interface';

const execAsync = promisify(exec);

/**
 * Abstract base class for CLI adapters.
 * Provides common functionality that all CLI adapters share.
 */
export abstract class BaseCliAdapter implements CliAdapter {
  abstract readonly backend: CliBackend;
  abstract readonly displayName: string;

  protected readonly config: CliConfig;

  constructor(config: CliConfig) {
    this.config = config;
  }

  /**
   * Build the command invocation - must be implemented by each adapter
   */
  abstract buildCommand(options: CliCommandOptions): CliInvocation;

  /**
   * Default output parsing - returns stdout as-is.
   * Override in adapters that need special parsing (e.g., Claude JSON).
   */
  parseOutput(stdout: string): CliOutputResult {
    return {
      content: stdout,
      success: true,
    };
  }

  /**
   * Check if the CLI binary is available on the system
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Use 'which' on Unix-like systems, 'where' on Windows
      const command =
        process.platform === 'win32'
          ? `where ${this.config.binPath}`
          : `which ${this.config.binPath}`;

      await execAsync(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the configured binary path
   */
  getBinPath(): string {
    return this.config.binPath;
  }

  /**
   * Get the default model for this backend
   */
  getDefaultModel(): string | undefined {
    return this.config.defaultModel;
  }

  /**
   * Get the default timeout in milliseconds
   */
  getDefaultTimeoutMs(): number {
    return this.config.defaultTimeoutMs ?? 120000; // 2 minutes default
  }
}
