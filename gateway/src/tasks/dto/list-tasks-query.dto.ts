import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AnyBackend } from '../../adapters';
import { TaskState } from '../task-types';

const VALID_BACKENDS: AnyBackend[] = [
  'codex',
  'claude-cli',
  'gemini-cli',
  'openai-api',
  'anthropic-api',
  'gemini-api',
  'openrouter-api',
  'venice-api',
  'hosted-api',
];

const VALID_STATES: TaskState[] = [
  'queued',
  'running',
  'completed',
  'error',
  'canceled',
];

export class ListTasksQueryDto {
  @ApiPropertyOptional({
    description: 'Page size (1–200). Defaults to 50.',
    minimum: 1,
    maximum: 200,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Opaque cursor from a previous response\'s `next_cursor`. Omit on the first page.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filter by backend.',
    enum: VALID_BACKENDS,
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_BACKENDS, {
    message: `backend must be one of: ${VALID_BACKENDS.join(', ')}`,
  })
  backend?: AnyBackend;

  @ApiPropertyOptional({
    description: 'Filter by task state.',
    enum: VALID_STATES,
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_STATES, {
    message: `state must be one of: ${VALID_STATES.join(', ')}`,
  })
  state?: TaskState;
}
