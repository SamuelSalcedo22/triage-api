import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../common/enums';
import { Case } from '../../cases/entities/case.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  /** Especialidad del médico (ej. Medicina interna). Solo para ESPECIALISTA */
  @Column({ type: 'varchar', length: 100, nullable: true })
  specialty: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  /** Casos registrados por este promotor */
  @OneToMany(() => Case, (c) => c.createdBy)
  createdCases: Case[];

  /** Casos que este especialista tomó */
  @OneToMany(() => Case, (c) => c.assignedTo)
  assignedCases: Case[];
}
