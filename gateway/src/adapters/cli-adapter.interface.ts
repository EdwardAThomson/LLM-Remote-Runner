/**
 * CLI Adapter Interface
 *
 * Defines the contract for all CLI-based LLM backends (Codex, Claude, Gemini).
 * Each adapter knows how to build commands and parse output for its specific CLI.
 */

/**
 * Supported CLI backends
 */
export type CliBackend = 'codex' | 'claude-cli' | 'gemini-cli';

/**
 * Configuration for a CLI adapter
 */
export interface CliConfig {
  /** Path to the CLI binary */
  binPath: string;
  /** Default model for this backend (if applicable) */
  defaultModel?: string;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
}

/**
 * Represents a CLI command ready to be spawned
 */
export interface CliInvocation {
  /** The binary to execute */
  command: string;
  /** Arguments to pass to the binary */
  args: string[];
  /** Environment variables to set (merged with process.env) */
  env?: Record<string, string>;
}

/**
 * Options for building a CLI command
 */
export interface CliCommandOptions {
  /** The prompt to send to the LLM */
  prompt: string;
  /** Working directory for the command */
  cwd?: string;
  /** Model override (if supported by the backend) */
  model?: string;
}

/**
 * Result of parsing CLI output
 */
export interface CliOutputResult {
  /** The parsed/extracted content */
  content: string;
  /** Whether parsing was successful */
  success: boolean;
  /** Error message if parsing failed */
  error?: string;
}

/**
 * Interface that all CLI adapters must implement
 */
export interface CliAdapter {
  /** The backend type this adapter handles */
  readonly backend: CliBackend;

  /** Human-readable name for display */
  readonly displayName: string;

  /**
   * Build the command invocation for this backend
   * @param options - Command options including prompt and cwd
   * @returns The command, args, and optional env vars to spawn
   */
  buildCommand(options: CliCommandOptions): CliInvocation;

  /**
   * Parse the raw stdout from the CLI into usable content.
   * Some CLIs (like Claude) return JSON that needs extraction.
   * Default implementation just returns stdout as-is.
   * @param stdout - Raw stdout from the CLI process
   * @returns Parsed result with content or error
   */
  parseOutput(stdout: string): CliOutputResult;

  /**
   * Check if this CLI is available on the system
   * @returns Promise resolving to true if the CLI binary exists and is executable
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the binary path for this adapter
   */
  getBinPath(): string;
}
