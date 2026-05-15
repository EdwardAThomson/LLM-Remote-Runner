import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Admin password.' })
  @IsString()
  @MinLength(1)
  password!: string;
}
