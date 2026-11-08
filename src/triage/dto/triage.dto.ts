import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Priority } from '../../common/enums';
import { CreateVitalSignsDto } from '../../cases/dto/vital-signs.dto';

/**
 * Body de POST /triage/evaluate
 * - Con caseId: guarda una nueva toma de signos en ese caso, lo reevalúa y
 *   actualiza su prioridad (usa los síntomas y antecedentes guardados).
 * - Sin caseId: solo calcula y devuelve el resultado (simulación, no guarda nada).
 *   En ese modo se usan los campos symptoms / hasHypertension / etc. del body.
 */
export class EvaluateTriageDto {
  /** Caso a reevaluar (opcional)
   * @example 1 */
  @IsOptional()
  @IsInt()
  @IsPositive()
  caseId?: number;

  @ValidateNested()
  @Type(() => CreateVitalSignsDto)
  vitalSigns: CreateVitalSignsDto;

  /** Solo modo simulación
   * @example "Dolor de pecho desde hace 2 horas" */
  @IsOptional()
  @IsString()
  symptoms?: string;

  /** Solo modo simulación
   * @example 65 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;

  /** Solo modo simulación
   * @example true */
  @IsOptional()
  @IsBoolean()
  hasHypertension?: boolean;

  /** Solo modo simulación
   * @example false */
  @IsOptional()
  @IsBoolean()
  hasDiabetes?: boolean;

  /** Solo modo simulación: usa la Escala 2 de SpO2 de NEWS2
   * @example false */
  @IsOptional()
  @IsBoolean()
  hasHypercapnicRespiratoryFailure?: boolean;

  /** Solo modo simulación
   * @example false */
  @IsOptional()
  @IsBoolean()
  isPregnant?: boolean;
}

export class QueueQueryDto {
  @ApiPropertyOptional({ enum: Priority, description: 'Filtrar por prioridad' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({
    description: 'true = solo casos que nadie ha tomado todavía',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyAvailable?: boolean;

  @ApiPropertyOptional({
    description: 'ID del especialista que consulta: marca en cada caso si es suyo (isMine)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  specialistId?: number;
}
