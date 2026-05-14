import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
