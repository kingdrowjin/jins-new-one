import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendSmsDto {
  @ApiProperty({ example: '9876543210', description: '10 digit mobile number' })
  @IsString()
  @MinLength(10)
  number: string;

  @ApiProperty({ example: 'This is a test message' })
  @IsString()
  @MinLength(1)
  msg: string;

  @ApiPropertyOptional({ example: 'ABCDEF', description: '6 character sender name' })
  @IsOptional()
  @IsString()
  sendername?: string;
}
