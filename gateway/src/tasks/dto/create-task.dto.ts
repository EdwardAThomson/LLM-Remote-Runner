import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { AnyBackend } from '../../adapters';

/**
 * Supported backend values for validation (CLI + API)
 */
const VALID_BACKENDS: AnyBackend[] = [
  // CLI backends
  'codex',
  'claude-cli',
  'gemini-cli',
  // API backends
  'openai-api',
  'anthropic-api',
  'gemini-api',
  'openrouter-api',
  'venice-api',
  'hosted-api',
];

export class CreateTaskDto {
  @ApiProperty({
    description: 'Prompt sent to the LLM backend.',
    example: 'Reply with the single word: pong',
  })
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @ApiPropertyOptional({
    description:
      'Workspace directory the CLI runs in. Must be inside the configured allowlist. Ignored for API backends.',
    example: '/home/edward/llm-workspace',
  })
  @IsString()
  @IsOptional()
  cwd?: string;

  @ApiPropertyOptional({
    description: 'Backend to use. Defaults to the gateway-configured DEFAULT_BACKEND.',
    enum: VALID_BACKENDS,
  })
  @IsString()
  @IsOptional()
  @IsIn(VALID_BACKENDS, {
    message: `backend must be one of: ${VALID_BACKENDS.join(', ')}`,
  })
  backend?: AnyBackend;

  @ApiPropertyOptional({
    description:
      'Model override for backends that support it. Use the backend default when omitted.',
    example: 'gemini-3.1-pro-preview',
  })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({
    description: 'System prompt (API backends only).',
  })
  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @ApiPropertyOptional({
    description:
      'If set, the gateway POSTs `{ task_id, state, exit_code, error_message }` here when the task finalizes. Signed with HMAC-SHA256 using `webhookSecret`.',
    example: 'https://example.com/runner-webhooks',
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  webhookUrl?: string;

  @ApiPropertyOptional({
    description:
      'Shared secret used to HMAC-sign the webhook body. Never returned in any response.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;
}
