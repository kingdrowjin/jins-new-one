import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  async create(
    @CurrentUser() user: { userId: number },
    @Body() createApiKeyDto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(user.userId, createApiKeyDto.name);
  }

  @Get()
  @ApiOperation({ summary: 'Get all API keys' })
  async findAll(@CurrentUser() user: { userId: number }) {
    const keys = await this.apiKeysService.findAll(user.userId);
    return keys.map((k) => ({
      ...k,
      key: k.key.substring(0, 8) + '...' + k.key.substring(k.key.length - 4),
    }));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an API key' })
  async delete(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.apiKeysService.delete(id, user.userId);
    return { success: true };
  }
}
