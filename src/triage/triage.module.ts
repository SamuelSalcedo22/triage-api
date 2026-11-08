import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Case } from '../cases/entities/case.entity';
import { VitalSigns } from '../cases/entities/vital-signs.entity';
import { TriageRecord } from './entities/triage-record.entity';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

@Module({
  imports: [TypeOrmModule.forFeature([TriageRecord, Case, VitalSigns])],
  controllers: [TriageController],
  providers: [TriageService],
  exports: [TriageService], // CasesService lo usa para calcular el triage al crear un caso
})
export class TriageModule {}
