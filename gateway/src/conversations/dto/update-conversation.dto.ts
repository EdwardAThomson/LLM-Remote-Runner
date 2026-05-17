import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

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
}
