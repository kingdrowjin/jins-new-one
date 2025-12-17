import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'My API Key' })
  @IsString()
  @MinLength(1)
  name: string;
}
