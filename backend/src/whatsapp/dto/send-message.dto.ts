import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: '919876543210' })
  @IsString()
  @MinLength(10)
  recipient: string;

  @ApiProperty({ example: 'Hello! This is a test message.' })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({ example: '/path/to/media.jpg' })
  @IsOptional()
  @IsString()
  mediaPath?: string;
}
