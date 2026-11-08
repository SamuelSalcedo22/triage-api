import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DocumentType, Sex } from '../../common/enums';

export class CreatePatientDto {
  /** @example "CC" */
  @IsEnum(DocumentType)
  documentType: DocumentType;

  /** Solo números y letras, sin puntos
   * @example "1085123456" */
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,20}$/, {
    message: 'documentNumber debe tener entre 4 y 20 letras o números, sin puntos ni espacios',
  })
  documentNumber: string;

  /** @example "María José" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  /** @example "Burbano Rosero" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  /** Formato YYYY-MM-DD
   * @example "1958-03-21" */
  @IsDateString()
  birthDate: string;

  /** @example "F" */
  @IsEnum(Sex)
  sex: Sex;

  /** @example "3104567890" */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** @example "Casa 12, sector la escuela" */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  /** Vereda, corregimiento o barrio
   * @example "Corregimiento de Catambuco" */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  locality?: string;

  /** @example "Pasto" */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipality?: string;

  /** @example "Nariño" */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  /** @example true */
  @IsOptional()
  @IsBoolean()
  hasHypertension?: boolean;

  /** @example true */
  @IsOptional()
  @IsBoolean()
  hasDiabetes?: boolean;

  /** EPOC con meta de saturación 88–92% indicada por médico (NEWS2 Escala 2)
   * @example false */
  @IsOptional()
  @IsBoolean()
  hasHypercapnicRespiratoryFailure?: boolean;

  /** @example false */
  @IsOptional()
  @IsBoolean()
  isPregnant?: boolean;

  /** @example "Hipotiroidismo" */
  @IsOptional()
  @IsString()
  otherConditions?: string;

  /** @example "Penicilina" */
  @IsOptional()
  @IsString()
  allergies?: string;

  /** @example "Losartán 50 mg cada 12 h, Metformina 850 mg cada 12 h" */
  @IsOptional()
  @IsString()
  currentMedications?: string;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

export class PatientsQueryDto {
  @ApiPropertyOptional({
    description: 'Buscar por nombre, apellido o número de documento',
    example: 'Burbano',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
