import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTokenDto {
  @ApiProperty({
    description:
      'Human-readable label for this token (shown in the settings UI). Use a name that identifies the service consuming it.',
    example: 'nightly-batch',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
