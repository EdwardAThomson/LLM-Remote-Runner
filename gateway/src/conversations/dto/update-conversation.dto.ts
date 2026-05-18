import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ConversationViewMode } from '../conversation-types';

const VALID_VIEW_MODES: ConversationViewMode[] = ['chat', 'console'];

export class UpdateConversationDto {
  @ApiPropertyOptional({
    description: 'New title. Use null to clear.',
    nullable: true,
    maxLength: 200,
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({
    description: 'New system prompt. Use null to clear.',
    nullable: true,
    maxLength: 8192,
  })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  @MaxLength(8192)
  systemPrompt?: string | null;

  @ApiPropertyOptional({
    description: 'Switch the render mode (chat | console). Persisted on the conversation row.',
    enum: VALID_VIEW_MODES,
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_VIEW_MODES, {
    message: `viewMode must be one of: ${VALID_VIEW_MODES.join(', ')}`,
  })
  viewMode?: ConversationViewMode;
}
