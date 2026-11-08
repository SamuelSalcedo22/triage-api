import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { AttachmentType } from '../../common/enums';

/** Campos de texto que acompañan al archivo en el form-data */
export class CreateAttachmentDto {
  @IsEnum(AttachmentType)
  type: AttachmentType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** En form-data todo llega como texto: @Type lo convierte a número */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  uploadedById?: number;
}

/** Tipos de archivo permitidos (fotos, ECG escaneado, PDF de historia clínica) */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
