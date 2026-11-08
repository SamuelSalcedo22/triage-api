import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CaseStatus, Priority } from '../../common/enums';
import type { TriageAlert } from '../../common/interfaces/triage.interfaces';
import { Patient } from '../../patients/entities/patient.entity';
import { User } from '../../users/entities/user.entity';
import { TriageRecord } from '../../triage/entities/triage-record.entity';
import { Attachment } from '../../attachments/entities/attachment.entity';
import { VitalSigns } from './vital-signs.entity';

@Entity({ name: 'cases' })
export class Case {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Patient, (p) => p.cases, { nullable: false })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  /** Promotor que registró el caso */
  @ManyToOne(() => User, (u) => u.createdCases, { nullable: false })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  /** Especialista que tomó el caso (null = disponible en la cola) */
  @ManyToOne(() => User, (u) => u.assignedCases, { nullable: true })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: User | null;

  /** Motivo de consulta (frase corta) */
  @Column({ type: 'varchar', length: 255, name: 'reason_for_consultation' })
  reasonForConsultation: string;

  /** Síntomas en texto libre, como los describe el paciente/promotor */
  @Column({ type: 'text' })
  symptoms: string;

  @Column({ type: 'text', nullable: true, name: 'promoter_notes' })
  promoterNotes: string | null;

  @Column({ type: 'enum', enum: CaseStatus, default: CaseStatus.PENDIENTE })
  status: CaseStatus;

  // ---- Resultado del último triage (copiado aquí para ordenar la cola rápido) ----

  @Column({ type: 'enum', enum: Priority, default: Priority.BAJA })
  priority: Priority;

  @Column({ type: 'int', default: 0, name: 'news2_score' })
  news2Score: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  alerts: TriageAlert[];

  // ---- Cierre por parte del especialista ----

  @Column({ type: 'text', nullable: true, name: 'specialist_notes' })
  specialistNotes: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'assigned_at' })
  assignedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'closed_at' })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => VitalSigns, (v) => v.case)
  vitalSigns: VitalSigns[];

  @OneToMany(() => TriageRecord, (t) => t.case)
  triageRecords: TriageRecord[];

  @OneToMany(() => Attachment, (a) => a.case)
  attachments: Attachment[];
}
