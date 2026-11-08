import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CASE_STATUS_TRANSITIONS, CaseStatus, Role } from '../common/enums';
import { PatientsService } from '../patients/patients.service';
import { TriageService } from '../triage/triage.service';
import { UsersService } from '../users/users.service';
import { AddVitalSignsDto, AssignCaseDto, CasesQueryDto, CreateCaseDto, UpdateCaseDto, UpdateCaseStatusDto } from './dto/case.dto';
import { Case } from './entities/case.entity';
import { VitalSigns } from './entities/vital-signs.entity';

const OPEN_STATUSES = [CaseStatus.PENDIENTE, CaseStatus.EN_REVISION];

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(Case) private readonly caseRepository: Repository<Case>,
    @InjectRepository(VitalSigns)
    private readonly vitalSignsRepository: Repository<VitalSigns>,
    private readonly patientsService: PatientsService,
    private readonly usersService: UsersService,
    private readonly triageService: TriageService,
  ) {}

  /**
   * Crea el caso, guarda los signos vitales y calcula el triage automáticamente.
   */
  async createCase(dto: CreateCaseDto) {
    this.triageService.assertValidVitals(dto.vitalSigns);
    const patient = await this.patientsService.findOne(dto.patientId);
    const promoter = await this.usersService.findWithRole(dto.createdById, [Role.PROMOTOR, Role.ADMIN]);

    const { vitalSigns, ...caseData } = dto;
    const newCase = await this.caseRepository.save(
      this.caseRepository.create({
        ...caseData,
        patient,
        createdBy: promoter,
      }),
    );
    const vitals = await this.vitalSignsRepository.save(this.vitalSignsRepository.create({ ...vitalSigns, case: { id: newCase.id } }));

    // Triage automático
    newCase.patient = patient;
    const { result } = await this.triageService.evaluateAndSave(newCase, vitals);

    return {
      message: `Caso creado con prioridad ${result.priority}`,
      data: { case: await this.findOne(newCase.id), triage: result },
    };
  }

  async findAll(query: CasesQueryDto) {
    const where: FindOptionsWhere<Case> = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.patientId) where.patient = { id: query.patientId };
    if (query.createdById) where.createdBy = { id: query.createdById };
    if (query.assignedToId) where.assignedTo = { id: query.assignedToId };

    const cases = await this.caseRepository.find({
      where,
      relations: { patient: true, createdBy: true, assignedTo: true },
      order: { createdAt: 'DESC' },
    });
    return { message: 'Casos encontrados', data: cases, count: cases.length };
  }

  async findById(id: number) {
    return { message: 'Caso encontrado', data: await this.findOne(id) };
  }

  /** Edita textos del caso. Si cambian los síntomas se recalcula el triage */
  async updateCase(id: number, dto: UpdateCaseDto) {
    const caseEntity = await this.findOne(id);
    this.assertOpen(caseEntity);
    const symptomsChanged = dto.symptoms !== undefined && dto.symptoms !== caseEntity.symptoms;

    await this.caseRepository.update(id, dto);

    if (symptomsChanged && caseEntity.vitalSigns.length > 0) {
      const updated = await this.findOne(id);
      await this.triageService.evaluateAndSave(updated, updated.vitalSigns[0]);
    }
    return {
      message: symptomsChanged ? 'Caso actualizado y triage recalculado' : 'Caso actualizado',
      data: await this.findOne(id),
    };
  }

  /** Nueva toma de signos vitales (control) → recalcula el triage */
  async addVitalSigns(id: number, dto: AddVitalSignsDto) {
    this.triageService.assertValidVitals(dto);
    const caseEntity = await this.findOne(id);
    this.assertOpen(caseEntity);
    const vitals = await this.vitalSignsRepository.save(this.vitalSignsRepository.create({ ...dto, case: { id } }));
    const { result } = await this.triageService.evaluateAndSave(caseEntity, vitals);
    return {
      message: `Signos vitales registrados. Prioridad actual: ${result.priority}`,
      data: { vitalSigns: vitals, triage: result },
    };
  }

  /** Un especialista toma el caso de la cola → EN_REVISION */
  async assignCase(id: number, dto: AssignCaseDto) {
    const specialist = await this.usersService.findWithRole(dto.specialistId, [Role.ESPECIALISTA]);
    const caseEntity = await this.findOne(id);

    if (caseEntity.assignedTo && caseEntity.assignedTo.id !== specialist.id) {
      throw new ConflictException(`El caso ${id} ya lo tomó ${caseEntity.assignedTo.fullName}`);
    }
    if (caseEntity.status !== CaseStatus.PENDIENTE && !caseEntity.assignedTo) {
      throw new BadRequestException(`Solo se pueden tomar casos PENDIENTE (estado actual: ${caseEntity.status})`);
    }

    await this.caseRepository.update(id, {
      assignedTo: { id: specialist.id },
      status: CaseStatus.EN_REVISION,
      assignedAt: new Date(),
    });
    return {
      message: `Caso ${id} asignado a ${specialist.fullName}`,
      data: await this.findOne(id),
    };
  }

  /** El especialista suelta el caso (no lo puede atender) → vuelve a PENDIENTE */
  async releaseCase(id: number) {
    const caseEntity = await this.findOne(id);
    if (caseEntity.status !== CaseStatus.EN_REVISION) {
      throw new BadRequestException(`Solo se pueden liberar casos EN_REVISION (estado actual: ${caseEntity.status})`);
    }
    await this.caseRepository.update(id, {
      assignedTo: null,
      assignedAt: null,
      status: CaseStatus.PENDIENTE,
    });
    return {
      message: `Caso ${id} liberado: vuelve a la cola como PENDIENTE`,
      data: await this.findOne(id),
    };
  }

  /** Cambia el estado respetando las transiciones permitidas */
  async updateStatus(id: number, dto: UpdateCaseStatusDto) {
    const caseEntity = await this.findOne(id);
    const allowed = CASE_STATUS_TRANSITIONS[caseEntity.status];

    if (dto.status === CaseStatus.EN_REVISION) {
      throw new BadRequestException('Para pasar a EN_REVISION usa PATCH /cases/:id/assign (así queda registrado quién lo tomó)');
    }
    if (dto.status === CaseStatus.PENDIENTE) {
      throw new BadRequestException('Para devolver el caso a PENDIENTE usa PATCH /cases/:id/release');
    }
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`No se puede pasar de ${caseEntity.status} a ${dto.status}. Permitidos: ${allowed.join(', ') || 'ninguno'}`);
    }
    const needsNotes = [CaseStatus.ATENDIDO, CaseStatus.DERIVADO];
    if (needsNotes.includes(dto.status) && !dto.specialistNotes?.trim()) {
      throw new BadRequestException(`specialistNotes es obligatorio para marcar el caso como ${dto.status}`);
    }

    await this.caseRepository.update(id, {
      status: dto.status,
      ...(dto.specialistNotes ? { specialistNotes: dto.specialistNotes } : {}),
      ...(dto.status === CaseStatus.CERRADO ? { closedAt: new Date() } : {}),
    });
    return {
      message: `Caso ${id} actualizado a ${dto.status}`,
      data: await this.findOne(id),
    };
  }

  /** Caso con todas sus relaciones (signos y triage más recientes primero) */
  async findOne(id: number) {
    const caseEntity = await this.caseRepository.findOne({
      where: { id },
      relations: {
        patient: true,
        createdBy: true,
        assignedTo: true,
        vitalSigns: true,
        triageRecords: true,
        attachments: true,
      },
      order: {
        vitalSigns: { measuredAt: 'DESC' },
        triageRecords: { evaluatedAt: 'DESC' },
        attachments: { createdAt: 'DESC' },
      },
    });
    if (!caseEntity) {
      throw new NotFoundException(`Caso con ID ${id} no encontrado`);
    }
    return caseEntity;
  }

  private assertOpen(caseEntity: Case) {
    if (!OPEN_STATUSES.includes(caseEntity.status)) {
      throw new BadRequestException(`El caso ${caseEntity.id} está ${caseEntity.status} y ya no se puede modificar`);
    }
  }
}
