// Ejecuta TODAS las pruebas en orden y genera el reporte de evidencias:
//     npm run test:todo
//
//   evidencias/REPORTE.md        resumen con todos los resultados (para mostrar o enviar)
//   resultados/salida-*.txt      la salida completa de cada prueba
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

mkdirSync('resultados', { recursive: true });
mkdirSync('evidencias', { recursive: true });

const sinColores = (texto) => texto.replace(/\x1b\[[0-9;]*m/g, '');
const leerJson = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null);

/** Ejecuta un comando mostrando su salida en vivo y guardándola en un archivo */
function ejecutar(nombre, comando) {
  console.log(`\n\x1b[36m━━━━ ${nombre} ━━━━\x1b[0m\n> ${comando}\n`);
  return new Promise((resolve) => {
    const inicio = Date.now();
    let salida = '';
    const hijo = spawn(comando, { shell: true });
    const recibir = (datos) => {
      process.stdout.write(datos);
      salida += datos;
    };
    hijo.stdout.on('data', recibir);
    hijo.stderr.on('data', recibir);
    hijo.on('exit', (codigo) => {
      resolve({ ok: codigo === 0, segundos: ((Date.now() - inicio) / 1000).toFixed(1), salida: sinColores(salida) });
    });
  });
}

const vitest = (clave, extra) => `npx vitest run ${extra} --reporter=verbose --reporter=json --outputFile.json=resultados/${clave}.json --silent=false`;

const SUITES = [
  { clave: 'unitarias', nombre: '1. Pruebas unitarias (reglas clínicas)', comando: vitest('unitarias', 'src'), demuestra: 'El cálculo NEWS2 y las reglas de hipertensión, diabetes y síntomas dan la prioridad correcta.' },
  { clave: 'arquitectura', nombre: '2. Prueba de arquitectura (capas sin atajos)', comando: vitest('arquitectura', 'test/arquitectura'), demuestra: 'Las dependencias van en una sola dirección: Controller → Service → Entity. Ningún controller toca la base de datos.' },
  { clave: 'e2e', nombre: '3. Prueba de punta a punta (esqueleto)', comando: vitest('e2e', '--config vitest.config.e2e.mts'), demuestra: 'Una petición HTTP atraviesa todas las capas hasta PostgreSQL y vuelve; las reglas de negocio se cumplen.' },
  { clave: 'carga', nombre: '4. Prueba de carga (1x contra 10x)', comando: 'npx nest build && node test/carga/prueba-carga.mjs', demuestra: 'El escenario de rendimiento se cumple con carga normal y se sabe qué se degrada primero al crecer 10 veces.' },
  { clave: 'disponibilidad', nombre: '5. Prueba de disponibilidad (caída de la BD)', comando: 'node test/disponibilidad/prueba-disponibilidad.mjs', demuestra: 'Si se cae la base de datos la API no se cae, lo detecta y se recupera sola.' },
];

// La base de datos debe estar encendida antes de empezar
console.log('Verificando PostgreSQL (docker compose up -d --wait postgres)...');
if (spawnSync('docker compose up -d --wait postgres', { shell: true, stdio: 'inherit' }).status !== 0) {
  console.error('\nNo se pudo iniciar PostgreSQL. Abre Docker Desktop y vuelve a intentarlo.');
  process.exit(1);
}

for (const suite of SUITES) {
  Object.assign(suite, await ejecutar(suite.nombre, suite.comando));
  writeFileSync(`resultados/salida-${suite.clave}.txt`, suite.salida);
}

// ------------------------------------------------------------------
//  Reporte en Markdown
// ------------------------------------------------------------------
const tabla = (filas) => {
  if (!filas?.length) return '_(sin datos)_\n';
  const columnas = Object.keys(filas[0]);
  return [`| ${columnas.join(' | ')} |`, `|${columnas.map(() => '---').join('|')}|`, ...filas.map((f) => `| ${columnas.map((c) => f[c]).join(' | ')} |`)].join('\n') + '\n';
};

function detalleVitest(clave) {
  const json = leerJson(`resultados/${clave}.json`);
  if (!json) return { conteo: 'sin datos', lista: '' };
  const pruebas = json.testResults.flatMap((archivo) => archivo.assertionResults);
  const lista = pruebas.map((p) => `- ${p.status === 'passed' ? '✅' : '❌'} ${[...p.ancestorTitles.slice(1), p.title].join(' › ')}`).join('\n');
  return { conteo: `${json.numPassedTests} de ${json.numTotalTests} pruebas pasan`, lista };
}

const carga = leerJson('resultados/carga.json');
const disponibilidad = leerJson('resultados/disponibilidad.json');
const detalles = { unitarias: detalleVitest('unitarias'), arquitectura: detalleVitest('arquitectura'), e2e: detalleVitest('e2e') };
detalles.carga = { conteo: carga ? `${carga.veredictos.filter((v) => v.resultado === 'CUMPLE').length} de ${carga.veredictos.length} límites cumplidos` : 'sin datos' };
detalles.disponibilidad = { conteo: disponibilidad ? `${disponibilidad.resultados.filter((r) => r.resultado === 'CUMPLE').length} de ${disponibilidad.resultados.length} verificaciones cumplidas` : 'sin datos' };

const mapaDependencias = (SUITES[1].salida.match(/Dependencias entre módulos:\n((?: {2}.+\n)+)/) ?? [])[1] ?? '';

const md = `# Reporte de pruebas — API de Triage

- **Fecha:** ${new Date().toLocaleString('es-CO')}
- **Equipo:** ${os.cpus()[0].model.trim()}, ${os.cpus().length} núcleos, ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM, ${os.type()} ${os.release()}
- **Node.js:** ${process.version} · PostgreSQL 16 en Docker
- **Cómo se generó:** \`npm run test:todo\`

## Resumen

${tabla(SUITES.map((s) => ({ Prueba: s.nombre, Resultado: s.ok ? '✅ PASA' : '❌ FALLA', Detalle: detalles[s.clave].conteo, Duración: `${s.segundos} s`, 'Qué demuestra': s.demuestra })))}

## 1. Pruebas unitarias

Comando: \`npm run test:unit\`

${detalles.unitarias.lista}

## 2. Prueba de arquitectura

Comando: \`npm run test:arq\`

${detalles.arquitectura.lista}

Dependencias reales entre módulos (extraídas de los \`import\` del código):

\`\`\`
${mapaDependencias}\`\`\`

## 3. Prueba de punta a punta

Comando: \`npm run test:e2e\` · usa la base de datos \`triage_e2e\`, que se crea vacía en cada ejecución.

${detalles.e2e.lista}

## 4. Prueba de carga: 1x contra 10x

Comando: \`npm run test:carga\` · API propia en el puerto 3100 y base de datos \`triage_carga\`. Cada medición dura ${carga?.duracionPorMedicionSeg ?? '?'} s.

### Escenario de rendimiento con carga normal (1x)

${tabla(carga?.veredictos)}
### Todas las mediciones

${tabla(carga?.mediciones)}
### ¿Qué se degrada más al crecer 10 veces?

${tabla(carga?.degradacion)}
Tamaño de la respuesta de la cola: **${carga?.cola1x.casos} casos = ${carga?.cola1x.kb} KB** · **${carga?.cola10x.casos} casos = ${carga?.cola10x.kb} KB** (la cola no tiene paginación).

## 5. Prueba de disponibilidad: caída de la base de datos

Comando: \`npm run test:disponibilidad\`

${tabla(disponibilidad?.resultados)}
`;

writeFileSync('evidencias/REPORTE.md', md);

console.log('\n\x1b[36m━━━━ RESUMEN ━━━━\x1b[0m');
console.table(SUITES.map((s) => ({ prueba: s.nombre, resultado: s.ok ? 'PASA' : 'FALLA', detalle: detalles[s.clave].conteo, segundos: s.segundos })));
console.log('Reporte generado: evidencias/REPORTE.md');
console.log('Salida completa de cada prueba: resultados/salida-*.txt\n');
process.exit(SUITES.every((s) => s.ok) ? 0 : 1);
