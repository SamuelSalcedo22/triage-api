import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Consciousness } from '../../common/enums';
import { Case } from './case.entity';

/** PostgreSQL devuelve los "numeric" como texto; esto los convierte a número */
const numericTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value == null ? null : Number(value)),
};

/** Una toma de signos vitales. Un caso puede tener varias (controles). */
@Entity({ name: 'vital_signs' })
export class VitalSigns {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Case, (c) => c.vitalSigns, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'case_id' })
  case: Case;

  /** Frecuencia respiratoria (respiraciones por minuto) */
  @Column({ type: 'int', name: 'respiratory_rate' })
  respiratoryRate: number;

  /** Saturación de oxígeno (%) */
  @Column({ type: 'int' })
  spo2: number;

  /** ¿Recibe oxígeno suplementario? */
  @Column({ type: 'boolean', default: false, name: 'on_supplemental_oxygen' })
  onSupplementalOxygen: boolean;

  /** Presión arterial sistólica (mmHg) */
  @Column({ type: 'int', name: 'systolic_bp' })
  systolicBp: number;

  /** Presión arterial diastólica (mmHg) */
  @Column({ type: 'int', name: 'diastolic_bp' })
  diastolicBp: number;

  /** Frecuencia cardiaca (latidos por minuto) */
  @Column({ type: 'int', name: 'heart_rate' })
  heartRate: number;

  /** Temperatura (°C) */
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    transformer: numericTransformer,
  })
  temperature: number;

  /** Nivel de conciencia (ACVPU) */
  @Column({ type: 'enum', enum: Consciousness })
  consciousness: Consciousness;

  /** Glucometría capilar (mg/dL) */
  @Column({ type: 'int', nullable: true })
  glucose: number | null;

  /** ¿La glucometría fue en ayunas? */
  @Column({ type: 'boolean', nullable: true, name: 'is_fasting' })
  isFasting: boolean | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'measured_at' })
  measuredAt: Date;
}
