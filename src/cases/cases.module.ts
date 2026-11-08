import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientsModule } from '../patients/patients.module';
import { TriageModule } from '../triage/triage.module';
import { UsersModule } from '../users/users.module';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { Case } from './entities/case.entity';
import { VitalSigns } from './entities/vital-signs.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Case, VitalSigns]),
    PatientsModule, // para validar que el paciente exista
    UsersModule, // para validar promotor / especialista
    TriageModule, // para calcular el triage al crear el caso
  ],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
