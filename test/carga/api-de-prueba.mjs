// Utilidad compartida por las pruebas de carga y de disponibilidad:
// levanta una copia de la API (la versión compilada en dist/) en otro puerto
// y contra otra base de datos, para no tocar los datos de desarrollo.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');

export const PUERTO = 3100;
export const BASE = `http://localhost:${PUERTO}/api/v1`;

const conexion = () => ({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  user: process.env.POSTGRES_USER ?? 'triage_user',
  password: process.env.POSTGRES_PASSWORD ?? 'triage_password',
});

/** Borra y crea de nuevo una base de datos vacía */
export async function recrearBaseDeDatos(nombre) {
  const client = new pg.Client({ ...conexion(), database: 'postgres' });
  try {
    await client.connect();
  } catch {
    throw new Error('No se pudo conectar a PostgreSQL. Ejecuta primero: docker compose up -d --wait postgres');
  }
  await client.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${nombre}`);
  await client.end();
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Estado de /health: 200, 503 o 0 si la API ni siquiera responde */
export async function estadoHealth() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000) });
    return res.status;
  } catch {
    return 0;
  }
}

/** Arranca la API compilada y espera a que /health responda 200 */
export async function levantarApi(baseDeDatos) {
  if (!existsSync('dist/main.js')) throw new Error('Falta compilar: ejecuta "npm run build"');
  const proceso = spawn(process.execPath, ['dist/main.js'], {
    env: { ...process.env, PORT: String(PUERTO), POSTGRES_DB: baseDeDatos, UPLOADS_DIR: 'resultados/uploads-pruebas' },
    // Para ver los logs de esta API de prueba: $env:VER_LOGS=1 antes de ejecutar
    stdio: ['ignore', 'ignore', process.env.VER_LOGS ? 'inherit' : 'ignore'],
  });
  const inicio = Date.now();
  while ((await estadoHealth()) !== 200) {
    if (Date.now() - inicio > 30000) {
      proceso.kill();
      throw new Error('La API no arrancó en 30 segundos');
    }
    await esperar(300);
  }
  return { proceso, tiempoDeArranqueMs: Date.now() - inicio };
}

export async function post(ruta, body) {
  const res = await fetch(`${BASE}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${ruta} → ${res.status}: ${await res.text()}`);
  return (await res.json()).data;
}
