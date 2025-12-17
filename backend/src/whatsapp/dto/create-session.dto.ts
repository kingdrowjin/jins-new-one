import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({ example: 'My Phone' })
  @IsString()
  @MinLength(1)
  sessionName: string;
}
