// Levanta TODO el sistema con un solo comando:  npm run levantar
//   1. Crea el archivo .env si no existe
//   2. Enciende PostgreSQL en Docker y espera a que esté listo
//   3. Arranca la API
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const run = (cmd) => spawnSync(cmd, { stdio: 'inherit', shell: true }).status === 0;

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('[levantar] Se creó .env a partir de .env.example');
}

console.log('[levantar] Encendiendo PostgreSQL (Docker)...');
if (!run('docker compose up -d --wait postgres')) {
  console.error('[levantar] No se pudo iniciar PostgreSQL. ¿Docker Desktop está abierto?');
  process.exit(1);
}

console.log('[levantar] Base de datos lista. Arrancando la API...');
const api = spawn('npx nest start', { stdio: 'inherit', shell: true });
api.on('exit', (code) => process.exit(code ?? 0));
