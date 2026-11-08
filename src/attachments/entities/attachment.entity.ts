import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AttachmentType } from '../../common/enums';
import { Case } from '../../cases/entities/case.entity';
import { User } from '../../users/entities/user.entity';

/** Archivo adjunto a un caso. El archivo vive en la carpeta /uploads; aquí solo se guardan sus datos */
@Entity({ name: 'attachments' })
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Case, (c) => c.attachments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'case_id' })
  case: Case;

  @Column({ type: 'enum', enum: AttachmentType })
  type: AttachmentType;

  /** Nombre original del archivo (como lo subió el usuario) */
  @Column({ type: 'varchar', length: 255, name: 'original_name' })
  originalName: string;

  /** Nombre con el que se guardó en disco (único) */
  @Column({ type: 'varchar', length: 255, name: 'stored_name', unique: true })
  storedName: string;

  @Column({ type: 'varchar', length: 100, name: 'mime_type' })
  mimeType: string;

  /** Tamaño en bytes */
  @Column({ type: 'int' })
  size: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
