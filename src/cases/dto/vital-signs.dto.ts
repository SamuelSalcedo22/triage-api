import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Consciousness } from '../../common/enums';

/**
 * Signos vitales tomados por el promotor.
 * Los rangos Min/Max NO son los "normales": son los límites de lo
 * fisiológicamente posible. Un valor fuera de ellos es un error de digitación
 * y se rechaza (400). Un valor anormal pero posible se acepta y genera alertas.
 */
export class CreateVitalSignsDto {
  /** Frecuencia respiratoria (resp/min)
   * @example 18 */
  @IsInt()
  @Min(1)
  @Max(80)
  respiratoryRate: number;

  /** Saturación de oxígeno por oxímetro (%)
   * @example 95 */
  @IsInt()
  @Min(50)
  @Max(100)
  spo2: number;

  /** ¿Recibe oxígeno suplementario?
   * @example false */
  @IsOptional()
  @IsBoolean()
  onSupplementalOxygen?: boolean;

  /** Presión sistólica (mmHg)
   * @example 150 */
  @IsInt()
  @Min(40)
  @Max(300)
  systolicBp: number;

  /** Presión diastólica (mmHg)
   * @example 95 */
  @IsInt()
  @Min(20)
  @Max(200)
  diastolicBp: number;

  /** Frecuencia cardiaca (lpm)
   * @example 88 */
  @IsInt()
  @Min(20)
  @Max(250)
  heartRate: number;

  /** Temperatura (°C), un decimal
   * @example 36.8 */
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'temperature debe ser un número con máximo 1 decimal (ej. 36.8)' })
  @Min(30)
  @Max(45)
  temperature: number;

  /** Nivel de conciencia ACVPU: A=alerta, C=confusión nueva, V=voz, P=dolor, U=no responde
   * @example "A" */
  @IsEnum(Consciousness)
  consciousness: Consciousness;

  /** Glucometría capilar (mg/dL). Opcional
   * @example 210 */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1500)
  glucose?: number;

  /** ¿La glucometría fue en ayunas (8 h o más sin comer)?
   * @example false */
  @IsOptional()
  @IsBoolean()
  isFasting?: boolean;
}
