import { AfterLoad, Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { DocumentType, Sex } from '../../common/enums';
import { Case } from '../../cases/entities/case.entity';

@Entity({ name: 'patients' })
@Unique('uq_patient_document', ['documentType', 'documentNumber'])
export class Patient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: DocumentType, name: 'document_type' })
  documentType: DocumentType;

  @Column({ type: 'varchar', length: 20, name: 'document_number' })
  documentNumber: string;

  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName: string;

  @Column({ type: 'date', name: 'birth_date' })
  birthDate: string;

  @Column({ type: 'enum', enum: Sex })
  sex: Sex;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  /** Vereda, corregimiento o barrio */
  @Column({ type: 'varchar', length: 150, nullable: true })
  locality: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Pasto' })
  municipality: string;

  @Column({ type: 'varchar', length: 100, default: 'Nariño' })
  department: string;

  // ---------- Antecedentes relevantes para el triage ----------

  @Column({ type: 'boolean', default: false, name: 'has_hypertension' })
  hasHypertension: boolean;

  @Column({ type: 'boolean', default: false, name: 'has_diabetes' })
  hasDiabetes: boolean;

  /**
   * EPOC u otra enfermedad con insuficiencia respiratoria hipercápnica
   * y meta de saturación 88–92% indicada por un médico.
   * Si es true, NEWS2 usa la Escala 2 de SpO2.
   */
  @Column({
    type: 'boolean',
    default: false,
    name: 'has_hypercapnic_respiratory_failure',
  })
  hasHypercapnicRespiratoryFailure: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_pregnant' })
  isPregnant: boolean;

  @Column({ type: 'text', nullable: true, name: 'other_conditions' })
  otherConditions: string | null;

  @Column({ type: 'text', nullable: true })
  allergies: string | null;

  @Column({ type: 'text', nullable: true, name: 'current_medications' })
  currentMedications: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Case, (c) => c.patient)
  cases: Case[];

  /** Edad calculada (no se guarda en la base de datos) */
  age: number;

  @AfterLoad()
  calculateAge() {
    this.age = Patient.ageFrom(this.birthDate);
  }

  static ageFrom(birthDate: string): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }
}
