/**
 * PRUEBA DE PUNTA A PUNTA (walking skeleton)
 * ------------------------------------------
 * Levanta la API completa (los mismos módulos y la misma configuración que
 * main.ts) contra PostgreSQL real y recorre el sistema de extremo a extremo:
 *
 *   HTTP → Controller → DTO/validación → Service → reglas de triage → BD → respuesta
 *
 * Los pasos se ejecutan en orden y cada uno depende del anterior, igual que
 * en la demostración en vivo.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

const signosNormales = {
  respiratoryRate: 16,
  spo2: 98,
  systolicBp: 120,
  diastolicBp: 80,
  heartRate: 72,
  temperature: 36.6,
  consciousness: 'A',
};

describe('Esqueleto de punta a punta', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  // IDs que se van creando durante el recorrido
  let promotorId: number;
  let especialistaA: number;
  let especialistaB: number;
  let pacienteId: number;
  let casoAlta: number;
  let casoMedia: number;
  let casoBaja: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  const crearCaso = (vitalSigns: object, symptoms: string, createdById = promotorId) =>
    http.post('/api/v1/cases').send({
      patientId: pacienteId,
      createdById,
      reasonForConsultation: 'Control',
      symptoms,
      vitalSigns: { ...signosNormales, ...vitalSigns },
    });

  // ------------------------------------------------------------------
  describe('1. El sistema arranca y está conectado a la base de datos', () => {
    it('GET /health responde 200 con la base de datos arriba', async () => {
      const res = await http.get('/api/v1/health').expect(200);
      expect(res.body.data.database).toBe('up');
    });
  });

  // ------------------------------------------------------------------
  describe('2. Tipos de usuario y pacientes', () => {
    it('crea un promotor y dos especialistas', async () => {
      const promotor = await http.post('/api/v1/users').send({ fullName: 'Pedro Promotor', email: 'pedro@e2e.com', role: 'PROMOTOR' }).expect(201);
      const a = await http.post('/api/v1/users').send({ fullName: 'Dra. Laura', email: 'laura@e2e.com', role: 'ESPECIALISTA', specialty: 'Medicina interna' }).expect(201);
      const b = await http.post('/api/v1/users').send({ fullName: 'Dr. Andrés', email: 'andres@e2e.com', role: 'ESPECIALISTA' }).expect(201);
      promotorId = promotor.body.data.id;
      especialistaA = a.body.data.id;
      especialistaB = b.body.data.id;
    });

    it('crea un paciente hipertenso y diabético y calcula su edad', async () => {
      const res = await http
        .post('/api/v1/patients')
        .send({ documentType: 'CC', documentNumber: '1085123456', firstName: 'María', lastName: 'Burbano', birthDate: '1958-03-21', sex: 'F', hasHypertension: true, hasDiabetes: true })
        .expect(201);
      pacienteId = res.body.data.id;
      expect(res.body.data.age).toBeGreaterThanOrEqual(68);
      expect(res.body.data.municipality).toBe('Pasto');
    });

    it('rechaza un paciente con documento repetido (409)', async () => {
      await http.post('/api/v1/patients').send({ documentType: 'CC', documentNumber: '1085123456', firstName: 'Otra', lastName: 'Persona', birthDate: '1990-01-01', sex: 'F' }).expect(409);
    });
  });

  // ------------------------------------------------------------------
  describe('3. Crear un caso dispara el triage automáticamente y lo guarda', () => {
    it('PA 192/112 + cefalea intensa → ALTA por sospecha de emergencia hipertensiva', async () => {
      const res = await crearCaso({ systolicBp: 192, diastolicBp: 112, glucose: 210 }, 'Dolor de cabeza intenso y visión borrosa. Niega dolor de pecho.').expect(201);
      casoAlta = res.body.data.case.id;
      const codigos = res.body.data.triage.alerts.map((a: { code: string }) => a.code);
      expect(res.body.data.triage.priority).toBe('ALTA');
      expect(codigos).toContain('HTA_EMERGENCIA');
      expect(codigos).not.toContain('SINTOMA_DOLOR_TORACICO'); // estaba negado
    });

    it('un solo parámetro en rojo (SpO2 91 %) → MEDIA', async () => {
      const res = await crearCaso({ spo2: 91 }, 'Tos').expect(201);
      casoMedia = res.body.data.case.id;
      expect(res.body.data.triage.priority).toBe('MEDIA');
      expect(res.body.data.triage.news2Score).toBe(3);
    });

    it('signos normales → BAJA', async () => {
      const res = await crearCaso({}, 'Control rutinario, asintomática').expect(201);
      casoBaja = res.body.data.case.id;
      expect(res.body.data.triage.priority).toBe('BAJA');
    });

    it('el caso quedó guardado en la BD con sus signos y su registro de triage', async () => {
      const res = await http.get(`/api/v1/cases/${casoAlta}`).expect(200);
      expect(res.body.data.status).toBe('PENDIENTE');
      expect(res.body.data.priority).toBe('ALTA');
      expect(res.body.data.vitalSigns).toHaveLength(1);
      expect(res.body.data.triageRecords).toHaveLength(1);
      expect(res.body.data.patient.id).toBe(pacienteId);
    });
  });

  // ------------------------------------------------------------------
  describe('4. La cola del especialista sale ordenada por prioridad', () => {
    it('GET /triage/queue devuelve ALTA → MEDIA → BAJA aunque se crearon en otro orden', async () => {
      const res = await http.get('/api/v1/triage/queue').expect(200);
      expect(res.body.data.map((c: { id: number }) => c.id)).toEqual([casoAlta, casoMedia, casoBaja]);
      expect(res.body.summary).toMatchObject({ ALTA: 1, MEDIA: 1, BAJA: 1, available: 3 });
    });
  });

  // ------------------------------------------------------------------
  describe('5. La entrada se valida antes de llegar a la lógica', () => {
    it('rechaza signos vitales imposibles (SpO2 150 %) con 400', async () => {
      const res = await crearCaso({ spo2: 150 }, 'x').expect(400);
      expect(res.body.message.join(' ')).toContain('spo2');
    });

    it('rechaza campos que no existen en el DTO (400)', async () => {
      await http.post('/api/v1/users').send({ fullName: 'X', email: 'x@e2e.com', role: 'PROMOTOR', esAdmin: true }).expect(400);
    });

    it('rechaza sistólica menor que diastólica (400)', async () => {
      await crearCaso({ systolicBp: 80, diastolicBp: 120 }, 'x').expect(400);
    });

    it('todos los errores tienen el mismo formato', async () => {
      const res = await http.get('/api/v1/cases/99999').expect(404);
      expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'path', 'statusCode', 'timestamp']);
    });
  });

  // ------------------------------------------------------------------
  describe('6. Reglas de negocio por tipo de usuario', () => {
    it('un especialista no puede registrar casos (solo el promotor)', async () => {
      await crearCaso({}, 'x', especialistaA).expect(400);
    });

    it('un promotor no puede tomar casos de la cola', async () => {
      await http.patch(`/api/v1/cases/${casoAlta}/assign`).send({ specialistId: promotorId }).expect(400);
    });

    it('la especialista A toma el caso → EN_REVISION', async () => {
      const res = await http.patch(`/api/v1/cases/${casoAlta}/assign`).send({ specialistId: especialistaA }).expect(200);
      expect(res.body.data.status).toBe('EN_REVISION');
      expect(res.body.data.assignedTo.id).toBe(especialistaA);
    });

    it('el especialista B no puede tomar el mismo caso (409)', async () => {
      await http.patch(`/api/v1/cases/${casoAlta}/assign`).send({ specialistId: especialistaB }).expect(409);
    });

    it('la cola le muestra a cada uno qué caso es suyo y cuáles están disponibles', async () => {
      const res = await http.get(`/api/v1/triage/queue?specialistId=${especialistaB}`).expect(200);
      const tomado = res.body.data.find((c: { id: number }) => c.id === casoAlta);
      expect(tomado).toMatchObject({ available: false, isMine: false });
      expect(res.body.summary.available).toBe(2);
    });
  });

  // ------------------------------------------------------------------
  describe('7. Ciclo de vida del caso', () => {
    it('no se puede marcar ATENDIDO sin notas del especialista (400)', async () => {
      await http.patch(`/api/v1/cases/${casoAlta}/status`).send({ status: 'ATENDIDO' }).expect(400);
    });

    it('con notas pasa a ATENDIDO y sale de la cola', async () => {
      await http.patch(`/api/v1/cases/${casoAlta}/status`).send({ status: 'ATENDIDO', specialistNotes: 'Se remite a urgencias.' }).expect(200);
      const cola = await http.get('/api/v1/triage/queue').expect(200);
      expect(cola.body.data.map((c: { id: number }) => c.id)).toEqual([casoMedia, casoBaja]);
    });

    it('no permite transiciones inválidas (ATENDIDO → DERIVADO)', async () => {
      await http.patch(`/api/v1/cases/${casoAlta}/status`).send({ status: 'DERIVADO', specialistNotes: 'x' }).expect(400);
    });
  });

  // ------------------------------------------------------------------
  describe('8. Reevaluación: nuevos signos cambian la prioridad y el orden de la cola', () => {
    it('POST /triage/evaluate con hipoglucemia (45 mg/dL) sube el caso BAJA a ALTA', async () => {
      const res = await http
        .post('/api/v1/triage/evaluate')
        .send({ caseId: casoBaja, vitalSigns: { ...signosNormales, glucose: 45 } })
        .expect(200);
      expect(res.body.data.priority).toBe('ALTA');
    });

    it('la cola se reordena: el caso reevaluado ahora va primero', async () => {
      const res = await http.get('/api/v1/triage/queue').expect(200);
      expect(res.body.data.map((c: { id: number }) => c.id)).toEqual([casoBaja, casoMedia]);
    });

    it('queda el historial de las dos evaluaciones', async () => {
      const res = await http.get(`/api/v1/triage/cases/${casoBaja}/history`).expect(200);
      expect(res.body.data.map((r: { priority: string }) => r.priority)).toEqual(['ALTA', 'BAJA']);
    });
  });

  // ------------------------------------------------------------------
  describe('9. Adjuntos (ECG, fotos, historia clínica)', () => {
    const pdf = Buffer.from('%PDF-1.4\n% ECG de prueba\n%%EOF');
    let adjuntoId: number;

    it('sube un PDF y lo asocia al caso', async () => {
      const res = await http
        .post(`/api/v1/cases/${casoMedia}/attachments`)
        .field('type', 'ECG')
        .field('description', 'ECG 12 derivaciones')
        .attach('file', pdf, { filename: 'ecg.pdf', contentType: 'application/pdf' })
        .expect(201);
      adjuntoId = res.body.data.id;
    });

    it('rechaza tipos de archivo no permitidos (400)', async () => {
      await http
        .post(`/api/v1/cases/${casoMedia}/attachments`)
        .field('type', 'OTRO')
        .attach('file', Buffer.from('hola'), { filename: 'nota.txt', contentType: 'text/plain' })
        .expect(400);
    });

    it('descarga exactamente el mismo archivo que se subió', async () => {
      const res = await http.get(`/api/v1/attachments/${adjuntoId}/file`).buffer(true).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(Buffer.compare(res.body as Buffer, pdf)).toBe(0);
    });
  });
});
