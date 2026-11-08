import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { Repository } from 'typeorm';
import { Case } from '../cases/entities/case.entity';
import { Env } from '../env.model';
import { UsersService } from '../users/users.service';
import { CreateAttachmentDto } from './dto/attachment.dto';
import { Attachment } from './entities/attachment.entity';

@Injectable()
export class AttachmentsService {
  private readonly uploadsDir: string;

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    @InjectRepository(Case)
    private readonly caseRepository: Repository<Case>,
    private readonly usersService: UsersService,
    configService: ConfigService<Env>,
  ) {
    this.uploadsDir = resolve(configService.get('UPLOADS_DIR') ?? 'uploads');
  }

  async upload(caseId: number, file: Express.Multer.File | undefined, dto: CreateAttachmentDto) {
    if (!file) {
      throw new BadRequestException('Debes enviar el archivo en el campo "file"');
    }
    const exists = await this.caseRepository.exists({ where: { id: caseId } });
    if (!exists) {
      throw new NotFoundException(`Caso con ID ${caseId} no encontrado`);
    }
    const uploadedBy = dto.uploadedById ? await this.usersService.findOne(dto.uploadedById) : null;

    // Se guarda en disco con un nombre único (nunca con el nombre original)
    const storedName = `${randomUUID()}${extname(file.originalname).toLowerCase()}`;
    await mkdir(this.uploadsDir, { recursive: true });
    await writeFile(join(this.uploadsDir, storedName), file.buffer);

    const attachment = await this.attachmentRepository.save(
      this.attachmentRepository.create({
        case: { id: caseId },
        type: dto.type,
        description: dto.description ?? null,
        uploadedBy,
        originalName: file.originalname,
        storedName,
        mimeType: file.mimetype,
        size: file.size,
      }),
    );
    return { message: 'Archivo subido con éxito', data: attachment };
  }

  async findByCase(caseId: number) {
    const attachments = await this.attachmentRepository.find({
      where: { case: { id: caseId } },
      relations: { uploadedBy: true },
      order: { createdAt: 'DESC' },
    });
    return {
      message: 'Adjuntos del caso',
      data: attachments,
      count: attachments.length,
    };
  }

  /** Devuelve los datos del adjunto y un stream para enviar el archivo */
  async getFile(id: number) {
    const attachment = await this.findOne(id);
    const path = join(this.uploadsDir, attachment.storedName);
    if (!existsSync(path)) {
      throw new NotFoundException('El archivo ya no existe en el servidor');
    }
    return { attachment, stream: createReadStream(path) };
  }

  async remove(id: number) {
    const attachment = await this.findOne(id);
    await this.attachmentRepository.delete(id);
    await unlink(join(this.uploadsDir, attachment.storedName)).catch(() => {
      /* si el archivo ya no estaba, no pasa nada */
    });
    return { message: 'Adjunto eliminado con éxito' };
  }

  private async findOne(id: number) {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
    });
    if (!attachment) {
      throw new NotFoundException(`Adjunto con ID ${id} no encontrado`);
    }
    return attachment;
  }
}
