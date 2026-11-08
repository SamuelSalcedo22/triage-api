import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CaseStatus, Priority } from '../../common/enums';
import { CreateVitalSignsDto } from './vital-signs.dto';

export class CreateCaseDto {
  /** ID del paciente
   * @example 1 */
  @IsInt()
  @IsPositive()
  patientId: number;

  /** ID del promotor que registra el caso
   * @example 1 */
  @IsInt()
  @IsPositive()
  createdById: number;

  /** Motivo de consulta
   * @example "Control de hipertensión y diabetes" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reasonForConsultation: string;

  /** Síntomas en texto libre
   * @example "Refiere dolor de cabeza intenso desde ayer y visión borrosa. Niega dolor de pecho." */
  @IsString()
  @IsNotEmpty()
  symptoms: string;

  /** Observaciones del promotor
   * @example "Paciente refiere que no toma el losartán hace 1 semana" */
  @IsOptional()
  @IsString()
  promoterNotes?: string;

  /** Signos vitales tomados en la visita */
  @ValidateNested()
  @Type(() => CreateVitalSignsDto)
  vitalSigns: CreateVitalSignsDto;
}

/** Solo se pueden editar los textos; si cambian los síntomas se recalcula el triage */
export class UpdateCaseDto extends PartialType(OmitType(CreateCaseDto, ['patientId', 'createdById', 'vitalSigns'] as const)) {}

export class AssignCaseDto {
  /** ID del especialista que toma el caso
   * @example 2 */
  @IsInt()
  @IsPositive()
  specialistId: number;
}

export class UpdateCaseStatusDto {
  /** Nuevo estado
   * @example "ATENDIDO" */
  @IsEnum(CaseStatus)
  status: CaseStatus;

  /** Conducta / notas del especialista. Obligatorio para ATENDIDO y DERIVADO
   * @example "Se ajusta losartán a 100 mg/día. Control en 1 semana." */
  @IsOptional()
  @IsString()
  specialistNotes?: string;
}

export class AddVitalSignsDto extends CreateVitalSignsDto {}

export class CasesQueryDto {
  @ApiPropertyOptional({ enum: CaseStatus })
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Casos de un paciente' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  patientId?: number;

  @ApiPropertyOptional({ description: 'Casos registrados por un promotor' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  createdById?: number;

  @ApiPropertyOptional({ description: 'Casos tomados por un especialista' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;
}
