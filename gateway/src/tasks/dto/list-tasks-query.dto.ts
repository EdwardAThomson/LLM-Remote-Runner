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
];

const VALID_STATES: TaskState[] = [
  'queued',
  'running',
  'completed',
  'error',
  'canceled',
];

export class ListTasksQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_BACKENDS, {
    message: `backend must be one of: ${VALID_BACKENDS.join(', ')}`,
  })
  backend?: AnyBackend;

  @IsOptional()
  @IsString()
  @IsIn(VALID_STATES, {
    message: `state must be one of: ${VALID_STATES.join(', ')}`,
  })
  state?: TaskState;
}
