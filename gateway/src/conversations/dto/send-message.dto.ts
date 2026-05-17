import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AnyBackend } from '../../adapters';

const VALID_BACKENDS: AnyBackend[] = [
  'codex',
  'claude-cli',
  'gemini-cli',
  'openai-api',
  'anthropic-api',
  'gemini-api',
];

export class SendMessageDto {
  @ApiProperty({
    description: 'The user message to append to the conversation.',
  })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({
    description:
      'Backend to use for this turn. Switching mid-conversation is supported — backend state lives in our DB.',
    enum: VALID_BACKENDS,
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_BACKENDS, {
    message: `backend must be one of: ${VALID_BACKENDS.join(', ')}`,
  })
  backend?: AnyBackend;

  @ApiPropertyOptional({
    description: 'Model override for this turn.',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description:
      'Workspace directory (CLI backends only). Must be inside the configured allowlist.',
  })
  @IsOptional()
  @IsString()
  cwd?: string;
}
