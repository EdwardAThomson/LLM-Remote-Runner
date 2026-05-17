import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
