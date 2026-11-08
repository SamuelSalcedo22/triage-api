import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Case } from '../cases/entities/case.entity';
import { VitalSigns } from '../cases/entities/vital-signs.entity';
import { Consciousness, Priority } from '../common/enums';
import { TriageRecord } from './entities/triage-record.entity';
import { TriageService } from './triage.service';

/** Signos vitales normales (NEWS2 = 0) para modificar en cada prueba */
const normal = {
  respiratoryRate: 16,
  spo2: 98,
  onSupplementalOxygen: false,
  systolicBp: 120,
  diastolicBp: 80,
  heartRate: 72,
  temperature: 36.6,
  consciousness: Consciousness.A,
};

describe('TriageService', () => {
  let service: TriageService;

  beforeEach(async () => {
    // Los repositorios se reemplazan por objetos vacíos: estas pruebas no usan BD
    const module: TestingModule = await Test.createTestingModule({
      providers: [TriageService, { provide: getRepositoryToken(TriageRecord), useValue: {} }, { provide: getRepositoryToken(Case), useValue: {} }, { provide: getRepositoryToken(VitalSigns), useValue: {} }],
    }).compile();

    service = module.get(TriageService);
  });

  const evaluate = (vitals: object, symptoms = '', patient = {}) =>
    service.calculateRisk({
      vitals: { ...normal, ...vitals },
      symptoms,
      patient,
    });

  it('signos normales → NEWS2 0 y prioridad BAJA', () => {
    const r = evaluate({});
    expect(r.news2Score).toBe(0);
    expect(r.priority).toBe(Priority.BAJA);
  });

  it('NEWS2 ≥ 7 → ALTA', () => {
    // FR 26 (3) + SpO2 91 (3) + PAS 95 (2) + FC 125 (2) + T 39.4 (2) + Confusión (3) = 15
    const r = evaluate({
      respiratoryRate: 26,
      spo2: 91,
      systolicBp: 95,
      heartRate: 125,
      temperature: 39.4,
      consciousness: Consciousness.C,
    });
    expect(r.news2Score).toBe(15);
    expect(r.priority).toBe(Priority.ALTA);
  });

  it('NEWS2 5–6 → MEDIA', () => {
    // FR 22 (2) + SpO2 94 (1) + FC 104 (1) + T 38.3 (1) = 5
    const r = evaluate({
      respiratoryRate: 22,
      spo2: 94,
      heartRate: 104,
      temperature: 38.3,
    });
    expect(r.news2Score).toBe(5);
    expect(r.priority).toBe(Priority.MEDIA);
  });

  it('un solo parámetro con 3 puntos → MEDIA aunque el total sea bajo', () => {
    const r = evaluate({ spo2: 91 });
    expect(r.news2Score).toBe(3);
    expect(r.hasRedScore).toBe(true);
    expect(r.priority).toBe(Priority.MEDIA);
  });

  it('Escala 2 de SpO2: 90% sin oxígeno no suma puntos en paciente con EPOC hipercápnico', () => {
    const r = evaluate({ spo2: 90 }, '', {
      hasHypercapnicRespiratoryFailure: true,
    });
    expect(r.news2Score).toBe(0);
  });

  it('PA ≥180/110 con síntomas de órgano blanco → ALTA (emergencia hipertensiva)', () => {
    const r = evaluate({ systolicBp: 192, diastolicBp: 112 }, 'dolor de cabeza intenso y visión borrosa');
    expect(r.priority).toBe(Priority.ALTA);
    expect(r.alerts.map((a) => a.code)).toContain('HTA_EMERGENCIA');
  });

  it('PA ≥180/110 sin síntomas → MEDIA (urgencia hipertensiva)', () => {
    const r = evaluate({ systolicBp: 185, diastolicBp: 100 }, 'asintomática');
    expect(r.priority).toBe(Priority.MEDIA);
    expect(r.alerts.map((a) => a.code)).toContain('HTA_GRADO_3');
  });

  it('hipoglucemia < 54 → ALTA', () => {
    expect(evaluate({ glucose: 45 }).priority).toBe(Priority.ALTA);
  });

  it('hipoglucemia 54–69 → MEDIA', () => {
    expect(evaluate({ glucose: 65 }).priority).toBe(Priority.MEDIA);
  });

  it('glucosa > 600 → ALTA', () => {
    expect(evaluate({ glucose: 650 }).priority).toBe(Priority.ALTA);
  });

  it('ignora síntomas negados ("niega dolor de pecho")', () => {
    const flags = service.detectRedFlagSymptoms('Niega dolor de pecho. Tos leve.');
    expect(flags).toHaveLength(0);
  });

  it('detecta síntomas de alarma sin importar tildes ni mayúsculas', () => {
    const flags = service.detectRedFlagSymptoms('DOLOR TORÁCICO desde hace 2 horas');
    expect(flags.map((f) => f.code)).toContain('DOLOR_TORACICO');
  });
});
