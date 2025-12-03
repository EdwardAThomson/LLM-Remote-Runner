/**
 * Adapter Factory
 *
 * Creates CLI adapters based on backend type.
 * Centralizes adapter instantiation and configuration.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CliAdapter, CliBackend, CliConfig } from './cli-adapter.interface';
import { CodexAdapter } from './codex.adapter';
import { ClaudeCliAdapter } from './claude-cli.adapter';
import { GeminiCliAdapter } from './gemini-cli.adapter';

/**
 * Configuration for all CLI adapters
 */
export interface AdapterConfigs {
  codex: CliConfig;
  'claude-cli': CliConfig;
  'gemini-cli': CliConfig;
}

/**
 * Factory for creating CLI adapters
 */
@Injectable()
export class AdapterFactory {
  private readonly adapters: Map<CliBackend, CliAdapter> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.initializeAdapters();
  }

  /**
   * Initialize all adapters with configuration from environment
   */
  private initializeAdapters(): void {
    // Codex adapter
    const codexConfig: CliConfig = {
      binPath: this.configService.get<string>('app.codexBinPath', 'codex'),
      defaultTimeoutMs: 300000,
    };
    this.adapters.set('codex', new CodexAdapter(codexConfig));

    // Claude CLI adapter
    const claudeConfig: CliConfig = {
      binPath: this.configService.get<string>('app.claudeBinPath', 'claude'),
      defaultTimeoutMs: 180000,
    };
    this.adapters.set('claude-cli', new ClaudeCliAdapter(claudeConfig));

    // Gemini CLI adapter
    const geminiConfig: CliConfig = {
      binPath: this.configService.get<string>('app.geminiBinPath', 'gemini'),
      defaultModel: this.configService.get<string>(
        'app.geminiDefaultModel',
        'gemini-2.5-pro',
      ),
      defaultTimeoutMs: 180000,
    };
    this.adapters.set('gemini-cli', new GeminiCliAdapter(geminiConfig));
  }

  /**
   * Get an adapter for the specified backend
   * @param backend - The CLI backend type
   * @returns The adapter instance
   * @throws Error if backend is not supported
   */
  getAdapter(backend: CliBackend): CliAdapter {
    const adapter = this.adapters.get(backend);
    if (!adapter) {
      throw new Error(
        `Unsupported backend: ${backend}. ` +
          `Supported backends: ${this.getSupportedBackends().join(', ')}`,
      );
    }
    return adapter;
  }

  /**
   * Get list of supported backend types
   */
  getSupportedBackends(): CliBackend[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check which backends are available on the system
   * @returns Map of backend to availability status
   */
  async checkAvailability(): Promise<Map<CliBackend, boolean>> {
    const results = new Map<CliBackend, boolean>();

    for (const [backend, adapter] of this.adapters) {
      results.set(backend, await adapter.isAvailable());
    }

    return results;
  }

  /**
   * Get all adapters
   */
  getAllAdapters(): CliAdapter[] {
    return Array.from(this.adapters.values());
  }
}
