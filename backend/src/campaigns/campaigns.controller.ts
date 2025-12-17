import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { AddRecipientsDto } from './dto/add-recipients.dto';
import { CampaignMedia, MediaType } from './campaign-media.entity';

@ApiTags('Campaigns')
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new campaign' })
  async create(
    @CurrentUser() user: { userId: number },
    @Body() createCampaignDto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(user.userId, createCampaignDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all campaigns' })
  async findAll(@CurrentUser() user: { userId: number }) {
    return this.campaignsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign by ID' })
  async findOne(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.campaignsService.findOne(id, user.userId);
  }

  @Post(':id/recipients')
  @ApiOperation({ summary: 'Add recipients to campaign' })
  async addRecipients(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() addRecipientsDto: AddRecipientsDto,
  ) {
    await this.campaignsService.addRecipients(id, user.userId, addRecipientsDto.phoneNumbers);
    return { success: true, message: 'Recipients added successfully' };
  }

  @Post(':id/media')
  @ApiOperation({ summary: 'Upload media to campaign' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = uuidv4();
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadMedia(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const results: CampaignMedia[] = [];

    for (const file of files) {
      let mediaType: MediaType;
      const mimeType = file.mimetype.toLowerCase();

      if (mimeType.startsWith('image/')) {
        mediaType = MediaType.IMAGE;
      } else if (mimeType.startsWith('video/')) {
        mediaType = MediaType.VIDEO;
      } else if (mimeType === 'application/pdf') {
        mediaType = MediaType.PDF;
      } else {
        continue;
      }

      const media = await this.campaignsService.addMedia(
        id,
        user.userId,
        mediaType,
        file.path,
        file.originalname,
        file.size,
      );
      results.push(media);
    }

    return { success: true, media: results };
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Start sending campaign messages' })
  async startCampaign(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const campaign = await this.campaignsService.startCampaign(id, user.userId);
    return { success: true, campaign };
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get campaign report' })
  async getReport(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.campaignsService.getCampaignReport(id, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a campaign' })
  async delete(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.campaignsService.delete(id, user.userId);
    return { success: true };
  }
}
