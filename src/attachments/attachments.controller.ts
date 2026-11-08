import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AttachmentType } from '../common/enums';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/attachment.dto';

@ApiTags('attachments')
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('cases/:caseId/attachments')
  @UseInterceptors(FileInterceptor('file')) // Multer lee el campo "file" del form-data
  @ApiOperation({
    summary: 'Subir adjunto (JPG, PNG, WEBP o PDF) a un caso',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: Object.values(AttachmentType) },
        description: { type: 'string', example: 'ECG de 12 derivaciones' },
        uploadedById: { type: 'integer', example: 1 },
      },
    },
  })
  upload(@Param('caseId', ParseIntPipe) caseId: number, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: CreateAttachmentDto) {
    return this.attachmentsService.upload(caseId, file, dto);
  }

  @Get('cases/:caseId/attachments')
  @ApiOperation({ summary: 'Listar adjuntos de un caso' })
  findByCase(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.attachmentsService.findByCase(caseId);
  }

  @Get('attachments/:id/file')
  @ApiOperation({
    summary: 'Ver / descargar el archivo (se muestra en el navegador)',
  })
  async getFile(@Param('id', ParseIntPipe) id: number) {
    const { attachment, stream } = await this.attachmentsService.getFile(id);
    return new StreamableFile(stream, {
      type: attachment.mimeType,
      length: attachment.size,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    });
  }

  @Delete('attachments/:id')
  @ApiOperation({ summary: 'Eliminar un adjunto' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.attachmentsService.remove(id);
  }
}
