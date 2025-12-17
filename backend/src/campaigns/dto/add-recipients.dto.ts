import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddRecipientsDto {
  @ApiProperty({
    example: ['919876543210', '919876543211'],
    description: 'Array of phone numbers',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  phoneNumbers: string[];
}
