import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Case } from '../cases/entities/case.entity';
import { Env } from '../env.model';
import { UsersModule } from '../users/users.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { ALLOWED_MIME_TYPES } from './dto/attachment.dto';
import { Attachment } from './entities/attachment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment, Case]),
    UsersModule,
    // Configuración de Multer (subida de archivos).
    // El archivo queda en memoria y el servicio lo escribe en disco
    // solo si todo es válido (así no quedan archivos huérfanos).
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => ({
        limits: {
          fileSize: Number(config.get('MAX_UPLOAD_MB') ?? 10) * 1024 * 1024,
        },
        fileFilter: (_req, file, callback) => {
          if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            callback(null, true);
          } else {
            callback(new BadRequestException(`Tipo de archivo no permitido (${file.mimetype}). Usa JPG, PNG, WEBP o PDF`), false);
          }
        },
      }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
