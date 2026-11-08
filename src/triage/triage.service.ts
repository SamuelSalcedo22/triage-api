import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Case } from '../cases/entities/case.entity';
import { VitalSigns } from '../cases/entities/vital-signs.entity';
import { CreateVitalSignsDto } from '../cases/dto/vital-signs.dto';
import { CaseStatus, Consciousness, highestPriority, Priority } from '../common/enums';
import { News2ParameterScore, TriageAlert, TriageResult } from '../common/interfaces/triage.interfaces';
import { Patient } from '../patients/entities/patient.entity';
import { EvaluateTriageDto, QueueQueryDto } from './dto/triage.dto';
import { TriageRecord } from './entities/triage-record.entity';

/** Signos vitales mínimos que necesita el cálculo */
type VitalsInput = Pick<CreateVitalSignsDto, 'respiratoryRate' | 'spo2' | 'onSupplementalOxygen' | 'systolicBp' | 'diastolicBp' | 'heartRate' | 'temperature' | 'consciousness'> & { glucose?: number | null; isFasting?: boolean | null };

/** Antecedentes del paciente que influyen en el triage */
export interface PatientProfile {
  age?: number;
  hasHypertension?: boolean;
  hasDiabetes?: boolean;
  hasHypercapnicRespiratoryFailure?: boolean;
  isPregnant?: boolean;
}

export interface RiskInput {
  vitals: VitalsInput;
  symptoms: string;
  patient: PatientProfile;
}

/**
 * Síntomas de alarma buscados en el texto libre.
 * targetOrgan = sugiere daño de órgano blanco (sirve para distinguir
 * emergencia vs. urgencia hipertensiva).
 */
const RED_FLAG_SYMPTOMS: {
  code: string;
  label: string;
  targetOrgan: boolean;
  keywords: string[];
}[] = [
  {
    code: 'DOLOR_TORACICO',
    label: 'dolor torácico',
    targetOrgan: true,
    keywords: ['dolor de pecho', 'dolor en el pecho', 'dolor toracico', 'opresion en el pecho', 'presion en el pecho'],
  },
  {
    code: 'DIFICULTAD_RESPIRATORIA',
    label: 'dificultad para respirar',
    targetOrgan: true,
    keywords: ['dificultad para respirar', 'falta de aire', 'falta el aire', 'ahogo', 'disnea', 'no puede respirar'],
  },
  {
    code: 'DEFICIT_NEUROLOGICO',
    label: 'posible déficit neurológico',
    targetOrgan: true,
    keywords: ['debilidad en un lado', 'debilidad de un lado', 'no puede mover', 'boca torcida', 'cara torcida', 'dificultad para hablar', 'no puede hablar', 'adormecimiento de un lado', 'hormigueo de un lado'],
  },
  {
    code: 'CEFALEA_INTENSA',
    label: 'cefalea intensa',
    targetOrgan: true,
    keywords: ['dolor de cabeza intenso', 'dolor de cabeza fuerte', 'dolor de cabeza muy fuerte', 'cefalea intensa', 'peor dolor de cabeza'],
  },
  {
    code: 'ALTERACION_VISUAL',
    label: 'alteración visual',
    targetOrgan: true,
    keywords: ['vision borrosa', 'perdida de vision', 'perdida de la vision', 'vision doble'],
  },
  {
    code: 'CONVULSION',
    label: 'convulsión',
    targetOrgan: true,
    keywords: ['convulsion', 'convulsiono', 'ataque epileptico'],
  },
  {
    code: 'PERDIDA_CONCIENCIA',
    label: 'pérdida de conciencia / desmayo',
    targetOrgan: true,
    keywords: ['desmayo', 'se desmayo', 'perdida de conciencia', 'perdio el conocimiento', 'sincope'],
  },
  {
    code: 'CONFUSION',
    label: 'confusión',
    targetOrgan: true,
    keywords: ['confusion', 'confundido', 'confundida', 'desorientado', 'desorientada'],
  },
  {
    code: 'SANGRADO',
    label: 'sangrado importante',
    targetOrgan: false,
    keywords: ['sangrado abundante', 'vomito con sangre', 'hemorragia', 'heces negras'],
  },
];

const RECOMMENDATIONS: Record<Priority, string> = {
  [Priority.ALTA]: 'Revisar de inmediato. Contactar al promotor/paciente y considerar remisión a urgencias.',
  [Priority.MEDIA]: 'Revisión urgente por el especialista el mismo día. Repetir signos vitales en 1 hora si es posible.',
  [Priority.BAJA]: 'Revisión rutinaria según orden de llegada. Continuar controles habituales.',
};

const OPEN_STATUSES = [CaseStatus.PENDIENTE, CaseStatus.EN_REVISION];

@Injectable()
export class TriageService {
  constructor(
    @InjectRepository(TriageRecord)
    private readonly triageRepository: Repository<TriageRecord>,
    @InjectRepository(Case)
    private readonly caseRepository: Repository<Case>,
    @InjectRepository(VitalSigns)
    private readonly vitalSignsRepository: Repository<VitalSigns>,
  ) {}

  // =====================================================================
  //  ENDPOINTS
  // =====================================================================

  /** POST /triage/evaluate */
  async evaluate(dto: EvaluateTriageDto) {
    this.assertValidVitals(dto.vitalSigns);

    // Modo simulación: solo calcula
    if (!dto.caseId) {
      const result = this.calculateRisk({
        vitals: dto.vitalSigns,
        symptoms: dto.symptoms ?? '',
        patient: {
          age: dto.age,
          hasHypertension: dto.hasHypertension,
          hasDiabetes: dto.hasDiabetes,
          hasHypercapnicRespiratoryFailure: dto.hasHypercapnicRespiratoryFailure,
          isPregnant: dto.isPregnant,
        },
      });
      return {
        message: 'Evaluación calculada (no se guardó porque no se envió caseId)',
        data: result,
      };
    }

    // Modo reevaluación: nueva toma de signos para un caso existente
    const caseEntity = await this.caseRepository.findOne({
      where: { id: dto.caseId },
      relations: { patient: true },
    });
    if (!caseEntity) {
      throw new NotFoundException(`Caso con ID ${dto.caseId} no encontrado`);
    }
    if (!OPEN_STATUSES.includes(caseEntity.status)) {
      throw new BadRequestException(`El caso ${caseEntity.id} está ${caseEntity.status}; solo se reevalúan casos PENDIENTE o EN_REVISION`);
    }
    const vitals = await this.vitalSignsRepository.save(
      this.vitalSignsRepository.create({
        ...dto.vitalSigns,
        case: { id: caseEntity.id },
      }),
    );
    const { record, result } = await this.evaluateAndSave(caseEntity, vitals);
    return {
      message: 'Caso reevaluado con los nuevos signos vitales',
      data: { caseId: caseEntity.id, triageRecordId: record.id, ...result },
    };
  }

  /** GET /triage/queue — casos abiertos ordenados por prioridad */
  async getPrioritizedQueue(query: QueueQueryDto) {
    const qb = this.caseRepository.createQueryBuilder('c').leftJoinAndSelect('c.patient', 'patient').leftJoinAndSelect('c.createdBy', 'createdBy').leftJoinAndSelect('c.assignedTo', 'assignedTo').where('c.status IN (:...statuses)', { statuses: OPEN_STATUSES });

    if (query.priority) {
      qb.andWhere('c.priority = :priority', { priority: query.priority });
    }
    if (query.onlyAvailable) {
      qb.andWhere('assignedTo.id IS NULL');
    }

    // 1) ALTA → MEDIA → BAJA (orden del enum), 2) mayor NEWS2, 3) el que más lleva esperando
    qb.orderBy('c.priority', 'ASC').addOrderBy('c.news2Score', 'DESC').addOrderBy('c.createdAt', 'ASC');

    const cases = await qb.getMany();
    const now = Date.now();

    const data = cases.map((c, index) => ({
      position: index + 1,
      ...c,
      waitingMinutes: Math.floor((now - c.createdAt.getTime()) / 60000),
      /** Nadie lo ha tomado: cualquier especialista puede atenderlo */
      available: c.assignedTo === null,
      /** Lo tomó el especialista que consulta */
      isMine: query.specialistId !== undefined && c.assignedTo?.id === query.specialistId,
    }));

    return {
      message: 'Cola de casos priorizada',
      data,
      count: data.length,
      summary: {
        ALTA: data.filter((c) => c.priority === Priority.ALTA).length,
        MEDIA: data.filter((c) => c.priority === Priority.MEDIA).length,
        BAJA: data.filter((c) => c.priority === Priority.BAJA).length,
        available: data.filter((c) => c.available).length,
      },
    };
  }

  /** GET /triage/cases/:caseId/history */
  async getCaseHistory(caseId: number) {
    const exists = await this.caseRepository.exists({ where: { id: caseId } });
    if (!exists) {
      throw new NotFoundException(`Caso con ID ${caseId} no encontrado`);
    }
    const records = await this.triageRepository.find({
      where: { case: { id: caseId } },
      relations: { vitalSigns: true },
      order: { evaluatedAt: 'DESC' },
    });
    return {
      message: 'Historial de evaluaciones del caso',
      data: records,
      count: records.length,
    };
  }

  // =====================================================================
  //  USADO POR CasesService
  // =====================================================================

  /** Calcula el triage de un caso, guarda el registro y actualiza la prioridad del caso */
  async evaluateAndSave(caseEntity: Case, vitals: VitalSigns) {
    const result = this.calculateRisk({
      vitals,
      symptoms: caseEntity.symptoms,
      patient: this.toProfile(caseEntity.patient),
    });

    const record = await this.triageRepository.save(
      this.triageRepository.create({
        ...result,
        case: { id: caseEntity.id },
        vitalSigns: { id: vitals.id },
      }),
    );

    caseEntity.priority = result.priority;
    caseEntity.news2Score = result.news2Score;
    caseEntity.alerts = result.alerts;
    await this.caseRepository.update(caseEntity.id, {
      priority: result.priority,
      news2Score: result.news2Score,
      alerts: result.alerts as never,
    });

    return { record, result };
  }

  /** La sistólica debe ser mayor que la diastólica */
  assertValidVitals(v: VitalsInput) {
    if (v.systolicBp <= v.diastolicBp) {
      throw new BadRequestException('La presión sistólica debe ser mayor que la diastólica (¿se invirtieron los valores?)');
    }
  }

  // =====================================================================
  //  CÁLCULO DEL RIESGO
  // =====================================================================

  /** Orquesta todo el cálculo: NEWS2 + reglas + alertas → prioridad final */
  calculateRisk(input: RiskInput): TriageResult {
    const news2 = this.applyNews2Rules(input.vitals, input.patient.hasHypercapnicRespiratoryFailure ?? false);

    // Tabla de respuesta clínica NEWS2 (Royal College of Physicians, 2017)
    let news2Priority = Priority.BAJA;
    if (news2.total >= 7) news2Priority = Priority.ALTA;
    else if (news2.total >= 5 || news2.hasRedScore) news2Priority = Priority.MEDIA;

    const alerts = this.generateAlerts(news2, input);
    const priority = highestPriority([news2Priority, ...alerts.map((a) => a.level)]);

    return {
      news2Score: news2.total,
      news2Breakdown: news2.breakdown,
      hasRedScore: news2.hasRedScore,
      news2Priority,
      priority,
      alerts,
      recommendation: RECOMMENDATIONS[priority],
    };
  }

  /**
   * NEWS2 — National Early Warning Score 2 (Royal College of Physicians, 2017).
   * Suma 0–3 puntos por cada uno de 7 parámetros.
   */
  applyNews2Rules(v: VitalsInput, useSpo2Scale2: boolean) {
    const onOxygen = v.onSupplementalOxygen ?? false;
    const breakdown: News2ParameterScore[] = [
      {
        parameter: 'Frecuencia respiratoria',
        value: v.respiratoryRate,
        points: this.scoreRespiratoryRate(v.respiratoryRate),
      },
      {
        parameter: useSpo2Scale2 ? 'SpO2 (Escala 2)' : 'SpO2 (Escala 1)',
        value: v.spo2,
        points: useSpo2Scale2 ? this.scoreSpo2Scale2(v.spo2, onOxygen) : this.scoreSpo2Scale1(v.spo2),
      },
      {
        parameter: 'Oxígeno suplementario',
        value: onOxygen,
        points: onOxygen ? 2 : 0,
      },
      {
        parameter: 'Presión sistólica',
        value: v.systolicBp,
        points: this.scoreSystolicBp(v.systolicBp),
      },
      {
        parameter: 'Frecuencia cardiaca',
        value: v.heartRate,
        points: this.scoreHeartRate(v.heartRate),
      },
      {
        parameter: 'Nivel de conciencia (ACVPU)',
        value: v.consciousness,
        points: v.consciousness === Consciousness.A ? 0 : 3,
      },
      {
        parameter: 'Temperatura',
        value: v.temperature,
        points: this.scoreTemperature(Number(v.temperature)),
      },
    ];
    const total = breakdown.reduce((sum, p) => sum + p.points, 0);
    const hasRedScore = breakdown.some((p) => p.points === 3);
    return { total, breakdown, hasRedScore };
  }

  /** Genera la lista de alertas: NEWS2 + HTA + diabetes + síntomas + avisos generales */
  generateAlerts(news2: ReturnType<TriageService['applyNews2Rules']>, input: RiskInput): TriageAlert[] {
    const alerts: TriageAlert[] = [];

    // --- NEWS2 ---
    if (news2.total >= 7) {
      alerts.push({
        level: Priority.ALTA,
        code: 'NEWS2_ALTO',
        source: 'NEWS2',
        message: `NEWS2 = ${news2.total} (≥7): riesgo clínico alto. Requiere respuesta de emergencia.`,
      });
    } else if (news2.total >= 5) {
      alerts.push({
        level: Priority.MEDIA,
        code: 'NEWS2_MEDIO',
        source: 'NEWS2',
        message: `NEWS2 = ${news2.total} (5–6): riesgo clínico medio. Requiere respuesta urgente.`,
      });
    }
    for (const p of news2.breakdown.filter((x) => x.points === 3)) {
      alerts.push({
        level: Priority.MEDIA,
        code: 'NEWS2_PARAMETRO_ROJO',
        source: 'NEWS2',
        message: `${p.parameter} = ${String(p.value)} suma 3 puntos (parámetro en rojo): valoración médica urgente.`,
      });
    }

    // --- Avisos de validez de NEWS2 ---
    const { age, isPregnant } = input.patient;
    if (age !== undefined && age < 16) {
      alerts.push({
        level: Priority.BAJA,
        code: 'NEWS2_NO_VALIDADO_EDAD',
        source: 'GENERAL',
        message: 'NEWS2 no está validado en menores de 16 años: interpretar el puntaje con precaución (usar escala pediátrica).',
      });
    }
    if (isPregnant) {
      alerts.push({
        level: Priority.BAJA,
        code: 'NEWS2_NO_VALIDADO_EMBARAZO',
        source: 'GENERAL',
        message: 'NEWS2 no está validado en embarazo: interpretar con criterio obstétrico.',
      });
    }

    const symptomFlags = this.detectRedFlagSymptoms(input.symptoms);
    alerts.push(...this.applyHypertensionRules(input, symptomFlags));
    alerts.push(...this.applyDiabetesRules(input));

    for (const flag of symptomFlags) {
      alerts.push({
        level: Priority.MEDIA,
        code: `SINTOMA_${flag.code}`,
        source: 'SINTOMAS',
        message: `Síntoma de alarma reportado: ${flag.label}. Verificar con el promotor.`,
      });
    }

    return alerts;
  }

  /**
   * Reglas de hipertensión — clasificación ESH 2023 (Sociedad Europea de Hipertensión).
   * Grado 3: PAS ≥180 y/o PAD ≥110. Con síntomas de daño agudo de órgano blanco
   * se sospecha emergencia hipertensiva.
   */
  applyHypertensionRules(input: RiskInput, symptomFlags: ReturnType<TriageService['detectRedFlagSymptoms']>): TriageAlert[] {
    const { systolicBp: s, diastolicBp: d, consciousness } = input.vitals;
    const bp = `${s}/${d} mmHg`;
    const organSymptoms = symptomFlags.filter((f) => f.targetOrgan);
    const alteredConsciousness = consciousness !== Consciousness.A;

    if (s >= 180 || d >= 110) {
      if (organSymptoms.length > 0 || alteredConsciousness) {
        const reasons = organSymptoms.map((f) => f.label);
        if (alteredConsciousness) reasons.push('alteración del estado de conciencia');
        return [
          {
            level: Priority.ALTA,
            code: 'HTA_EMERGENCIA',
            source: 'HTA',
            message: `PA ${bp} (≥180/110) con ${reasons.join(', ')}: sospecha de emergencia hipertensiva. Remitir a urgencias.`,
          },
        ];
      }
      return [
        {
          level: Priority.MEDIA,
          code: 'HTA_GRADO_3',
          source: 'HTA',
          message: `PA ${bp}: HTA grado 3 sin síntomas de daño de órgano blanco (urgencia hipertensiva). Valoración médica el mismo día; evitar bajar la PA bruscamente.`,
        },
      ];
    }
    if (s >= 160 || d >= 100) {
      return [
        {
          level: Priority.BAJA,
          code: 'HTA_GRADO_2',
          source: 'HTA',
          message: `PA ${bp}: HTA grado 2. Revisar adherencia y ajuste del tratamiento.`,
        },
      ];
    }
    if ((s >= 140 || d >= 90) && !input.patient.hasHypertension) {
      return [
        {
          level: Priority.BAJA,
          code: 'HTA_SIN_DIAGNOSTICO',
          source: 'HTA',
          message: `PA ${bp} (≥140/90) en paciente sin diagnóstico de HTA: confirmar con tomas repetidas.`,
        },
      ];
    }
    return [];
  }

  /**
   * Reglas de glucemia — ADA Standards of Care in Diabetes.
   * Hipoglucemia: nivel 1 <70, nivel 2 <54, nivel 3 = con alteración del estado mental.
   * Hiperglucemia: ≥250 riesgo de cetoacidosis; >600 sugiere estado hiperosmolar.
   */
  applyDiabetesRules(input: RiskInput): TriageAlert[] {
    const g = input.vitals.glucose;
    const { hasDiabetes } = input.patient;

    if (g === null || g === undefined) {
      return hasDiabetes
        ? [
            {
              level: Priority.BAJA,
              code: 'DM_SIN_GLUCOMETRIA',
              source: 'DIABETES',
              message: 'Paciente con diabetes sin glucometría registrada en esta toma.',
            },
          ]
        : [];
    }

    const altered = input.vitals.consciousness !== Consciousness.A;
    const val = `${g} mg/dL`;

    if (g < 70) {
      if (altered) {
        return [{ level: Priority.ALTA, code: 'DM_HIPOGLUCEMIA_NIVEL_3', source: 'DIABETES', message: `Glucosa ${val} con alteración de la conciencia: hipoglucemia severa (nivel 3). Emergencia.` }];
      }
      if (g < 54) {
        return [{ level: Priority.ALTA, code: 'DM_HIPOGLUCEMIA_NIVEL_2', source: 'DIABETES', message: `Glucosa ${val} (<54): hipoglucemia nivel 2, clínicamente significativa. Tratar de inmediato y valorar.` }];
      }
      return [{ level: Priority.MEDIA, code: 'DM_HIPOGLUCEMIA_NIVEL_1', source: 'DIABETES', message: `Glucosa ${val} (54–69): hipoglucemia nivel 1. Dar 15 g de carbohidratos y repetir glucometría en 15 minutos.` }];
    }
    if (g > 600) {
      return [{ level: Priority.ALTA, code: 'DM_SOSPECHA_EHH', source: 'DIABETES', message: `Glucosa ${val} (>600): sospecha de estado hiperosmolar hiperglucémico. Remitir a urgencias.` }];
    }
    if (g >= 250) {
      if (altered) {
        return [{ level: Priority.ALTA, code: 'DM_CRISIS_HIPERGLUCEMICA', source: 'DIABETES', message: `Glucosa ${val} con alteración de la conciencia: sospecha de crisis hiperglucémica (cetoacidosis / estado hiperosmolar).` }];
      }
      return [{ level: Priority.MEDIA, code: 'DM_HIPERGLUCEMIA_SEVERA', source: 'DIABETES', message: `Glucosa ${val} (≥250): riesgo de cetoacidosis. Indagar náuseas, vómito, dolor abdominal o respiración rápida.` }];
    }
    if (g >= 180) {
      return [hasDiabetes ? { level: Priority.BAJA, code: 'DM_FUERA_DE_META', source: 'DIABETES', message: `Glucosa ${val} (≥180): fuera de metas. Revisar adherencia y tratamiento.` } : { level: Priority.BAJA, code: 'DM_HIPERGLUCEMIA_SIN_DIAGNOSTICO', source: 'DIABETES', message: `Glucosa ${val} en paciente sin diagnóstico de diabetes: confirmar con exámenes de laboratorio.` }];
    }
    if (!hasDiabetes && input.vitals.isFasting && g >= 126) {
      return [{ level: Priority.BAJA, code: 'DM_POSIBLE_DIAGNOSTICO', source: 'DIABETES', message: `Glucosa en ayunas ${val} (≥126) sin diagnóstico de diabetes: confirmar con exámenes de laboratorio.` }];
    }
    return [];
  }

  /**
   * Busca síntomas de alarma en el texto libre (sin tildes ni mayúsculas).
   * Ignora frases negadas: "niega dolor de pecho", "sin dificultad para respirar".
   * Es una ayuda: el especialista siempre debe leer el texto completo.
   */
  detectRedFlagSymptoms(symptoms: string) {
    const text = this.normalize(symptoms ?? '');
    return RED_FLAG_SYMPTOMS.filter((flag) => flag.keywords.some((kw) => this.containsAffirmed(text, kw)));
  }

  // =====================================================================
  //  TABLAS DE PUNTAJE NEWS2
  // =====================================================================

  private scoreRespiratoryRate(rr: number) {
    if (rr <= 8) return 3;
    if (rr <= 11) return 1;
    if (rr <= 20) return 0;
    if (rr <= 24) return 2;
    return 3;
  }

  private scoreSpo2Scale1(spo2: number) {
    if (spo2 <= 91) return 3;
    if (spo2 <= 93) return 2;
    if (spo2 <= 95) return 1;
    return 0;
  }

  /** Escala 2: solo pacientes con meta de SpO2 88–92% (insuficiencia respiratoria hipercápnica) */
  private scoreSpo2Scale2(spo2: number, onOxygen: boolean) {
    if (spo2 <= 83) return 3;
    if (spo2 <= 85) return 2;
    if (spo2 <= 87) return 1;
    if (spo2 <= 92) return 0;
    if (!onOxygen) return 0; // ≥93% al aire ambiente
    if (spo2 <= 94) return 1;
    if (spo2 <= 96) return 2;
    return 3;
  }

  private scoreSystolicBp(sbp: number) {
    if (sbp <= 90) return 3;
    if (sbp <= 100) return 2;
    if (sbp <= 110) return 1;
    if (sbp <= 219) return 0;
    return 3;
  }

  private scoreHeartRate(hr: number) {
    if (hr <= 40) return 3;
    if (hr <= 50) return 1;
    if (hr <= 90) return 0;
    if (hr <= 110) return 1;
    if (hr <= 130) return 2;
    return 3;
  }

  private scoreTemperature(t: number) {
    if (t <= 35.0) return 3;
    if (t <= 36.0) return 1;
    if (t <= 38.0) return 0;
    if (t <= 39.0) return 1;
    return 2;
  }

  // =====================================================================
  //  AUXILIARES
  // =====================================================================

  private toProfile(patient: Patient): PatientProfile {
    return {
      age: patient.age ?? Patient.ageFrom(patient.birthDate),
      hasHypertension: patient.hasHypertension,
      hasDiabetes: patient.hasDiabetes,
      hasHypercapnicRespiratoryFailure: patient.hasHypercapnicRespiratoryFailure,
      isPregnant: patient.isPregnant,
    };
  }

  /** minúsculas y sin tildes: "Visión Borrosa" -> "vision borrosa" */
  private normalize(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /** true si la frase aparece y NO está precedida por "no", "niega" o "sin" */
  private containsAffirmed(text: string, keyword: string) {
    let index = text.indexOf(keyword);
    while (index !== -1) {
      const before = text.slice(Math.max(0, index - 30), index);
      // "no tiene dolor de pecho" → negado; "no come bien, dolor de pecho" → NO negado (la coma corta)
      const negated = /\b(no|niega|sin|nego)\s+([^\s,.;]+\s+){0,2}$/.test(before);
      const wordStart = index === 0 || /\W/.test(text[index - 1]);
      if (!negated && wordStart) return true;
      index = text.indexOf(keyword, index + keyword.length);
    }
    return false;
  }
}
