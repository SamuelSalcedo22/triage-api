import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Priority } from '../../common/enums';
import type { News2ParameterScore, TriageAlert } from '../../common/interfaces/triage.interfaces';
import { Case } from '../../cases/entities/case.entity';
import { VitalSigns } from '../../cases/entities/vital-signs.entity';

/** Historial: cada vez que se evalúa un caso se guarda un registro */
@Entity({ name: 'triage_records' })
export class TriageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Case, (c) => c.triageRecords, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'case_id' })
  case: Case;

  /** Signos vitales con los que se calculó */
  @ManyToOne(() => VitalSigns, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vital_signs_id' })
  vitalSigns: VitalSigns | null;

  @Column({ type: 'int', name: 'news2_score' })
  news2Score: number;

  /** Puntos de cada parámetro de NEWS2 */
  @Column({ type: 'jsonb', name: 'news2_breakdown' })
  news2Breakdown: News2ParameterScore[];

  @Column({ type: 'boolean', name: 'has_red_score' })
  hasRedScore: boolean;

  @Column({ type: 'enum', enum: Priority, name: 'news2_priority' })
  news2Priority: Priority;

  /** Prioridad final (NEWS2 + reglas HTA / diabetes / síntomas) */
  @Column({ type: 'enum', enum: Priority })
  priority: Priority;

  @Column({ type: 'jsonb' })
  alerts: TriageAlert[];

  @Column({ type: 'varchar', length: 255 })
  recommendation: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'evaluated_at' })
  evaluatedAt: Date;
}
