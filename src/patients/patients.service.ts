import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Case } from '../cases/entities/case.entity';
import { CreatePatientDto, PatientsQueryDto, UpdatePatientDto } from './dto/patient.dto';
import { Patient } from './entities/patient.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(Case)
    private readonly caseRepository: Repository<Case>,
  ) {}

  async createPatient(dto: CreatePatientDto) {
    this.validateBirthDate(dto.birthDate);
    const exists = await this.patientRepository.findOne({
      where: {
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
      },
    });
    if (exists) {
      throw new ConflictException(`Ya existe un paciente con ${dto.documentType} ${dto.documentNumber} (ID ${exists.id})`);
    }
    const saved = await this.patientRepository.save(this.patientRepository.create(dto));
    // Se vuelve a leer para que @AfterLoad calcule la edad
    return {
      message: 'Paciente creado con éxito',
      data: await this.findOne(saved.id),
    };
  }

  async findAll(query: PatientsQueryDto) {
    const where = query.search ? [{ firstName: ILike(`%${query.search}%`) }, { lastName: ILike(`%${query.search}%`) }, { documentNumber: ILike(`%${query.search}%`) }] : {};
    const patients = await this.patientRepository.find({
      where,
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
    return {
      message: 'Pacientes encontrados',
      data: patients,
      count: patients.length,
    };
  }

  async findById(id: number) {
    return { message: 'Paciente encontrado', data: await this.findOne(id) };
  }

  async updatePatient(id: number, dto: UpdatePatientDto) {
    if (dto.birthDate) this.validateBirthDate(dto.birthDate);
    const patient = await this.findOne(id);
    await this.patientRepository.save(this.patientRepository.merge(patient, dto));
    return {
      message: 'Paciente actualizado con éxito',
      data: await this.findOne(id),
    };
  }

  /** Historial de casos del paciente (más recientes primero) */
  async getPatientCases(id: number) {
    await this.findOne(id);
    const cases = await this.caseRepository.find({
      where: { patient: { id } },
      relations: { createdBy: true, assignedTo: true },
      order: { createdAt: 'DESC' },
    });
    return {
      message: 'Historial de casos del paciente',
      data: cases,
      count: cases.length,
    };
  }

  /** Busca un paciente o lanza 404 (lo usa también CasesService) */
  async findOne(id: number) {
    const patient = await this.patientRepository.findOne({ where: { id } });
    if (!patient) {
      throw new NotFoundException(`Paciente con ID ${id} no encontrado`);
    }
    return patient;
  }

  private validateBirthDate(birthDate: string) {
    const date = new Date(birthDate);
    if (date > new Date()) {
      throw new BadRequestException('birthDate no puede ser una fecha futura');
    }
    if (Patient.ageFrom(birthDate) > 120) {
      throw new BadRequestException('birthDate no es válida (edad mayor a 120 años)');
    }
  }
}
