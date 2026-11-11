/**
 * PRUEBA DE DISPONIBILIDAD: se cae la base de datos
 * -------------------------------------------------
 * Apaga PostgreSQL mientras la API está corriendo y verifica:
 *   1. La API NO se cae (el proceso sigue vivo).
 *   2. Detecta la falla: /health pasa de 200 a 503 (y se mide en cuánto tiempo).
 *   3. Se degrada, no colapsa: el cálculo de triage (sin BD) sigue respondiendo.
 *   4. Lo que necesita BD responde un error controlado, no se queda colgado.
 *   5. Al volver la BD, la API se recupera SOLA, sin reiniciarla (y se mide el tiempo).
 *   6. No se perdió ningún dato.
 *
 * Uso:  npm run test:disponibilidad
 * OJO: apaga el contenedor triage_postgres unos segundos y lo vuelve a encender.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASE, esperar, estadoHealth, levantarApi, post, recrearBaseDeDatos } from '../carga/api-de-prueba.mjs';

const CONTENEDOR = 'triage_postgres';
const docker = (...args) => spawnSync('docker', args, { stdio: 'ignore' }).status === 0;

const resultados = [];
const registrar = (verificacion, ok, detalle) => {
  resultados.push({ verificación: verificacion, resultado: ok ? 'CUMPLE' : 'NO CUMPLE', detalle });
  console.log(`  ${ok ? '✔' : '✘'} ${verificacion} — ${detalle}`);
};

async function esperarHealth(estadoEsperado, maximoMs) {
  const inicio = Date.now();
  while (Date.now() - inicio < maximoMs) {
    if ((await estadoHealth()) === estadoEsperado) return Date.now() - inicio;
    await esperar(250);
  }
  return null;
}

async function peticion(metodo, ruta, body) {
  const inicio = Date.now();
  try {
    const res = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    return { status: res.status, ms: Date.now() - inicio, json: await res.json().catch(() => null) };
  } catch {
    return { status: 0, ms: Date.now() - inicio, json: null };
  }
}

const signos = { respiratoryRate: 18, spo2: 96, systolicBp: 130, diastolicBp: 85, heartRate: 80, temperature: 36.8, consciousness: 'A' };

console.log('\n=== PRUEBA DE DISPONIBILIDAD: caída de la base de datos ===\n');
await recrearBaseDeDatos('triage_disponibilidad');
const { proceso } = await levantarApi('triage_disponibilidad');
let apiViva = true;
proceso.on('exit', () => (apiViva = false));

try {
  // ---- Estado normal ----
  const promotor = await post('/users', { fullName: 'Promotor Disponibilidad', email: 'disp@triage.com', role: 'PROMOTOR' });
  const paciente = await post('/patients', { documentType: 'CC', documentNumber: '70000001', firstName: 'Paciente', lastName: 'Disponibilidad', birthDate: '1960-05-10', sex: 'F' });
  await post('/cases', { patientId: paciente.id, createdById: promotor.id, reasonForConsultation: 'Control', symptoms: 'Control', vitalSigns: signos });
  registrar('Estado normal', (await estadoHealth()) === 200, '/health = 200 y se registró 1 caso');

  // ---- Falla: se apaga PostgreSQL ----
  console.log('\n  >> Apagando PostgreSQL (docker stop)...');
  docker('stop', CONTENEDOR);
  const deteccion = await esperarHealth(503, 20000);
  registrar('Detecta la falla', deteccion !== null, deteccion !== null ? `/health pasó a 503 en ${deteccion} ms` : '/health nunca reportó 503');

  const evaluar = await peticion('POST', '/triage/evaluate', { vitalSigns: { ...signos, systolicBp: 195, diastolicBp: 115 }, symptoms: 'dolor de pecho' });
  registrar('Degradación parcial: el cálculo de triage sigue funcionando sin BD', evaluar.status === 200 && evaluar.json?.data?.priority === 'ALTA', `POST /triage/evaluate → ${evaluar.status} (${evaluar.json?.data?.priority ?? 'sin respuesta'}) en ${evaluar.ms} ms`);

  const cola = await peticion('GET', '/triage/queue');
  registrar('Lo que necesita BD falla de forma controlada', cola.status >= 500 && cola.json?.statusCode !== undefined, `GET /triage/queue → ${cola.status} con el formato de error estándar en ${cola.ms} ms`);

  registrar('La API no se cae', apiViva, apiViva ? 'el proceso sigue vivo con la BD apagada' : 'el proceso de la API terminó');

  // ---- Recuperación: vuelve PostgreSQL ----
  console.log('\n  >> Encendiendo PostgreSQL (docker start)...');
  const inicioRecuperacion = Date.now();
  docker('start', CONTENEDOR);
  const recuperacion = await esperarHealth(200, 60000);
  registrar('Se recupera sola, sin reiniciar la API', recuperacion !== null && apiViva, recuperacion !== null ? `/health volvió a 200 en ${Date.now() - inicioRecuperacion} ms desde "docker start"` : 'no se recuperó en 60 s');

  const despues = await peticion('GET', '/triage/queue');
  registrar('No se perdieron datos', despues.status === 200 && despues.json?.count === 1, `la cola volvió a responder ${despues.status} con ${despues.json?.count ?? '?'} caso`);

  const nuevo = await peticion('POST', '/cases', { patientId: paciente.id, createdById: promotor.id, reasonForConsultation: 'Después de la caída', symptoms: 'Control', vitalSigns: signos });
  registrar('Vuelve a aceptar escrituras', nuevo.status === 201, `POST /cases → ${nuevo.status}`);
} finally {
  docker('start', CONTENEDOR); // pase lo que pase, la BD queda encendida
  proceso.kill();
}

console.log('\n=== RESULTADOS ===');
console.table(resultados);
mkdirSync('resultados', { recursive: true });
writeFileSync('resultados/disponibilidad.json', JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2));
console.log('Resultados guardados en resultados/disponibilidad.json\n');
process.exit(resultados.every((r) => r.resultado === 'CUMPLE') ? 0 : 1);
