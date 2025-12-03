import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
];

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsString()
  @IsOptional()
  cwd?: string;

  @IsString()
  @IsOptional()
  @IsIn(VALID_BACKENDS, {
    message: `backend must be one of: ${VALID_BACKENDS.join(', ')}`,
  })
  backend?: AnyBackend;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;
}
