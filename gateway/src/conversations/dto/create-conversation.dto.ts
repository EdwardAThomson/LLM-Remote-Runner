import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ConversationViewMode } from '../conversation-types';

const VALID_VIEW_MODES: ConversationViewMode[] = ['chat', 'console'];

export class CreateConversationDto {
  @ApiPropertyOptional({
    description:
      'Display title for the conversation. Auto-derived from the first user message when omitted.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description:
      'System prompt prepended to every turn. Edit later via PATCH if you want to change behaviour mid-conversation.',
    maxLength: 8192,
  })
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  systemPrompt?: string;

  @ApiPropertyOptional({
    description:
      'Optional: seed the conversation from an existing task. The task\'s prompt + captured stdout become the first user/assistant turn, and the conversation is linked back to the original task. Useful for "continue this run as a conversation" — refusing for tasks already inside a conversation.',
  })
  @IsOptional()
  @IsUUID()
  fromTaskId?: string;

  @ApiPropertyOptional({
    description:
      'Render mode hint for the UI. Defaults to `console` when seeded from a task (agentic CLI output), otherwise `chat` (Q&A bubbles).',
    enum: VALID_VIEW_MODES,
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_VIEW_MODES, {
    message: `viewMode must be one of: ${VALID_VIEW_MODES.join(', ')}`,
  })
  viewMode?: ConversationViewMode;
}
