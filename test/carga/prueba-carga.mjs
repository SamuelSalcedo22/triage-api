/**
 * PRUEBA DE CARGA: carga normal (1x) contra diez veces más (10x)
 * -------------------------------------------------------------
 * Responde con números a: "Si el negocio creciera diez veces,
 * ¿qué parte de este diseño se rompería primero?"
 *
 * Mide tres operaciones del sistema:
 *   A. Evaluar un triage      POST /triage/evaluate  (solo cálculo, sin BD)
 *   B. Consultar la cola      GET  /triage/queue     (lectura con joins)
 *   C. Registrar un caso      POST /cases            (validación + triage + 4 escrituras)
 *
 * Uso:  npm run test:carga
 * Usa su propia API (puerto 3100) y su propia base de datos (triage_carga).
 */
import autocannon from 'autocannon';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASE, levantarApi, post, recrearBaseDeDatos } from './api-de-prueba.mjs';

const DURACION = Number(process.env.CARGA_SEGUNDOS ?? 8); // segundos por medición
const CASOS_1X = 100; // casos abiertos en la cola con carga normal
const CASOS_10X = 1000;
const USUARIOS_1X = 10; // conexiones simultáneas con carga normal
const USUARIOS_10X = 100;

// Límites del escenario de rendimiento con carga normal (1x)
const LIMITES_P99_MS = { A: 200, B: 500, C: 500 };

const signos = (extra = {}) => ({ respiratoryRate: 18, spo2: 96, systolicBp: 130, diastolicBp: 85, heartRate: 80, temperature: 36.8, consciousness: 'A', ...extra });

// Mezcla realista: 10 % graves, 25 % intermedios, 65 % leves
function signosAleatorios(i) {
  if (i % 10 === 0) return signos({ respiratoryRate: 26, spo2: 90, heartRate: 128, temperature: 39.3 });
  if (i % 4 === 0) return signos({ systolicBp: 185, diastolicBp: 100, glucose: 260 });
  return signos({ glucose: 110 + (i % 60) });
}

async function medir(nombre, opciones) {
  const r = await autocannon({ duration: DURACION, ...opciones });
  const fila = {
    nombre,
    conexiones: opciones.connections,
    'req/s': Math.round(r.requests.average),
    'p50 ms': r.latency.p50,
    'p97.5 ms': r.latency.p97_5,
    'p99 ms': r.latency.p99,
    'máx ms': r.latency.max,
    errores: r.errors + r.timeouts + r.non2xx,
  };
  console.log(`  ✔ ${nombre}: ${fila['req/s']} req/s, p99 ${fila['p99 ms']} ms, errores ${fila.errores}`);
  return fila;
}

async function sembrarCasos(desde, hasta, promotorId, pacientes) {
  const LOTE = 20;
  for (let i = desde; i < hasta; i += LOTE) {
    const lote = [];
    for (let j = i; j < Math.min(i + LOTE, hasta); j++) {
      lote.push(
        post('/cases', {
          patientId: pacientes[j % pacientes.length],
          createdById: promotorId,
          reasonForConsultation: `Visita domiciliaria ${j}`,
          symptoms: j % 10 === 0 ? 'Fiebre alta y dificultad para respirar' : 'Control de enfermedad crónica',
          vitalSigns: signosAleatorios(j),
        }),
      );
    }
    await Promise.all(lote);
  }
}

async function tamanoDeLaCola() {
  const inicio = performance.now();
  const res = await fetch(`${BASE}/triage/queue`);
  const texto = await res.text();
  return { casos: JSON.parse(texto).count, kb: Math.round(texto.length / 1024), ms: Math.round(performance.now() - inicio) };
}

// ------------------------------------------------------------------
console.log('\n=== PRUEBA DE CARGA: 1x contra 10x ===\n');
console.log('Preparando base de datos triage_carga y levantando la API en el puerto 3100...');
await recrearBaseDeDatos('triage_carga');
const { proceso, tiempoDeArranqueMs } = await levantarApi('triage_carga');
console.log(`API lista en ${tiempoDeArranqueMs} ms (incluye crear las tablas)\n`);

const filas = [];
let cola1x, cola10x;
try {
  const promotor = await post('/users', { fullName: 'Promotor Carga', email: 'carga@triage.com', role: 'PROMOTOR' });
  const pacientes = [];
  for (let i = 0; i < 20; i++) {
    const p = await post('/patients', { documentType: 'CC', documentNumber: `90000${100 + i}`, firstName: `Paciente${i}`, lastName: 'Carga', birthDate: '1960-05-10', sex: i % 2 ? 'M' : 'F', hasHypertension: true, hasDiabetes: i % 3 === 0 });
    pacientes.push(p.id);
  }

  const headers = { 'content-type': 'application/json' };
  const cuerpoEvaluar = JSON.stringify({ vitalSigns: signos({ systolicBp: 190, diastolicBp: 112, glucose: 280 }), symptoms: 'Dolor de cabeza intenso y vision borrosa', hasHypertension: true, hasDiabetes: true, age: 66 });
  const cuerpoCaso = JSON.stringify({ patientId: pacientes[0], createdById: promotor.id, reasonForConsultation: 'Carga', symptoms: 'Control de enfermedad cronica', vitalSigns: signos({ glucose: 150 }) });

  // ---- B. Cola: 100 casos contra 1000 casos ----
  console.log(`B. Cola de triage con ${CASOS_1X} casos abiertos (1x)`);
  await sembrarCasos(0, CASOS_1X, promotor.id, pacientes);
  cola1x = await tamanoDeLaCola();
  filas.push(await medir(`B. GET /triage/queue · ${CASOS_1X} casos (1x)`, { url: `${BASE}/triage/queue`, connections: USUARIOS_1X }));

  console.log(`B. Cola de triage con ${CASOS_10X} casos abiertos (10x)`);
  await sembrarCasos(CASOS_1X, CASOS_10X, promotor.id, pacientes);
  cola10x = await tamanoDeLaCola();
  filas.push(await medir(`B. GET /triage/queue · ${CASOS_10X} casos (10x)`, { url: `${BASE}/triage/queue`, connections: USUARIOS_1X }));

  // ---- A. Evaluación: 10 usuarios contra 100 usuarios ----
  console.log('A. Evaluación de triage (cálculo NEWS2 + reglas, sin base de datos)');
  filas.push(await medir(`A. POST /triage/evaluate · ${USUARIOS_1X} usuarios (1x)`, { url: `${BASE}/triage/evaluate`, method: 'POST', headers, body: cuerpoEvaluar, connections: USUARIOS_1X }));
  filas.push(await medir(`A. POST /triage/evaluate · ${USUARIOS_10X} usuarios (10x)`, { url: `${BASE}/triage/evaluate`, method: 'POST', headers, body: cuerpoEvaluar, connections: USUARIOS_10X }));

  // ---- C. Registro de casos: 10 promotores contra 100 promotores ----
  console.log('C. Registro de casos (validación + triage automático + escrituras)');
  filas.push(await medir(`C. POST /cases · ${USUARIOS_1X} promotores (1x)`, { url: `${BASE}/cases`, method: 'POST', headers, body: cuerpoCaso, connections: USUARIOS_1X }));
  filas.push(await medir(`C. POST /cases · ${USUARIOS_10X} promotores (10x)`, { url: `${BASE}/cases`, method: 'POST', headers, body: cuerpoCaso, connections: USUARIOS_10X }));
} finally {
  proceso.kill();
}

// ------------------------------------------------------------------
console.log('\n=== RESULTADOS ===');
console.table(filas);
console.log(`Respuesta de la cola: ${cola1x.casos} casos = ${cola1x.kb} KB en ${cola1x.ms} ms  |  ${cola10x.casos} casos = ${cola10x.kb} KB en ${cola10x.ms} ms`);

const veredictos = filas
  .filter((f) => f.nombre.includes('(1x)'))
  .map((f) => {
    const limite = LIMITES_P99_MS[f.nombre[0]];
    const ok = f['p99 ms'] <= limite && f.errores === 0;
    return { escenario: f.nombre, 'límite p99 ms': limite, 'medido p99 ms': f['p99 ms'], errores: f.errores, resultado: ok ? 'CUMPLE' : 'NO CUMPLE' };
  });
console.log('\n=== ESCENARIO DE RENDIMIENTO (carga normal, 1x) ===');
console.table(veredictos);

const factor = (a, b) => (a > 0 ? (b / a).toFixed(1) : 'n/a');
const [b1, b10, a1, a10, c1, c10] = filas;
console.log('=== ¿QUÉ SE DEGRADA MÁS AL CRECER 10x? ===');
const comparar = (operacion, x1, x10) => ({
  operación: operacion,
  'req/s 1x': x1['req/s'],
  'req/s 10x': x10['req/s'],
  'p99 1x ms': x1['p99 ms'],
  'p99 10x ms': x10['p99 ms'],
  'veces más lento': factor(x1['p99 ms'], x10['p99 ms']),
  'errores 10x': x10.errores,
});
const degradacion = [
  comparar('B. Cola (10x casos abiertos)', b1, b10),
  comparar('A. Evaluación (10x usuarios)', a1, a10),
  comparar('C. Registro de casos (10x promotores)', c1, c10),
];
console.table(degradacion);

mkdirSync('resultados', { recursive: true });
writeFileSync('resultados/carga.json', JSON.stringify({ fecha: new Date().toISOString(), duracionPorMedicionSeg: DURACION, tiempoDeArranqueMs, cola1x, cola10x, mediciones: filas, veredictos, degradacion }, null, 2));
console.log('Resultados guardados en resultados/carga.json\n');

process.exit(veredictos.every((v) => v.resultado === 'CUMPLE') ? 0 : 1);
