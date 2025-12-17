import { IsString, IsOptional, IsNumber, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty({ example: 'My First Campaign' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'Hello! Check out our new offers.' })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  sessionId?: number;

  @ApiPropertyOptional({ example: 'Visit Now' })
  @IsOptional()
  @IsString()
  linkText?: string;

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiPropertyOptional({ example: 'Call Now' })
  @IsOptional()
  @IsString()
  callText?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  callNumber?: string;
}
