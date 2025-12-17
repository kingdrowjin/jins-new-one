import { IsString, IsOptional, IsArray, ArrayMinSize, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendBulkSmsDto {
  @ApiProperty({
    example: ['9876543210', '9876543211'],
    description: 'Array of 10 digit mobile numbers',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  numbers: string[];

  @ApiProperty({ example: 'This is a test message' })
  @IsString()
  @MinLength(1)
  msg: string;

  @ApiPropertyOptional({ example: 'ABCDEF', description: '6 character sender name' })
  @IsOptional()
  @IsString()
  sendername?: string;
}
