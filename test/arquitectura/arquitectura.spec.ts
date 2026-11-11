/**
 * PRUEBA DE ARQUITECTURA
 * ----------------------
 * Lee todos los archivos de src/, extrae sus "import" y verifica que las
 * dependencias apunten en UNA sola dirección y que no existan atajos:
 *
 *      Controller ──▶ Service ──▶ Entity / Repositorio (TypeORM)
 *          │             │
 *          └──▶ DTO ◀────┘            common ◀── (todos)
 *
 * Si alguien agrega un atajo (por ejemplo, un controller que consulta la base
 * de datos directamente), esta prueba falla y dice en qué archivo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

type Capa = 'controller' | 'service' | 'entity' | 'dto' | 'module' | 'common' | 'otro';

interface Archivo {
  /** Ruta relativa a src/, con "/" (ej. "cases/cases.service.ts") */
  ruta: string;
  capa: Capa;
  /** Carpeta de primer nivel: users, patients, cases, triage, attachments, health, common o "raiz" */
  modulo: string;
  /** Imports: rutas internas ya resueltas (relativas a src/) o nombres de paquetes */
  imports: string[];
}

const SRC = resolve(process.cwd(), 'src');
const LIBRERIAS_DE_DATOS = ['typeorm', '@nestjs/typeorm', 'pg'];

function capaDe(ruta: string): Capa {
  if (ruta.startsWith('common/')) return 'common';
  if (ruta.endsWith('.controller.ts')) return 'controller';
  if (ruta.endsWith('.service.ts')) return 'service';
  if (ruta.endsWith('.entity.ts')) return 'entity';
  if (ruta.endsWith('.dto.ts')) return 'dto';
  if (ruta.endsWith('.module.ts')) return 'module';
  return 'otro';
}

function moduloDe(ruta: string): string {
  return ruta.includes('/') ? ruta.split('/')[0] : 'raiz';
}

function listarTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const completo = join(dir, nombre);
    if (statSync(completo).isDirectory()) return listarTs(completo);
    return nombre.endsWith('.ts') && !nombre.endsWith('.spec.ts') ? [completo] : [];
  });
}

function resolverImport(desde: string, especificador: string): string {
  if (!especificador.startsWith('.')) return especificador; // paquete de npm
  let destino = resolve(dirname(desde), especificador);
  try {
    if (statSync(destino).isDirectory()) destino = join(destino, 'index');
  } catch {
    /* no es carpeta: es un archivo sin extensión */
  }
  return relative(SRC, destino).replace(/\\/g, '/') + '.ts';
}

function leerProyecto(): Archivo[] {
  return listarTs(SRC).map((completo) => {
    const ruta = relative(SRC, completo).replace(/\\/g, '/');
    const codigo = readFileSync(completo, 'utf8');
    const imports = [...codigo.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => resolverImport(completo, m[1]));
    return { ruta, capa: capaDe(ruta), modulo: moduloDe(ruta), imports };
  });
}

const esInterno = (imp: string) => imp.endsWith('.ts');

/** Devuelve la lista de violaciones encontradas (vacía = arquitectura respetada) */
function buscarViolaciones(archivos: Archivo[]): string[] {
  const v: string[] = [];

  for (const a of archivos) {
    for (const imp of a.imports) {
      const capaImp = esInterno(imp) ? capaDe(imp) : null;
      const moduloImp = esInterno(imp) ? moduloDe(imp) : null;

      // R1. common no conoce a los módulos de negocio
      if (a.capa === 'common' && esInterno(imp) && capaImp !== 'common') {
        v.push(`R1 ${a.ruta}: common no puede depender de ${imp}`);
      }

      if (a.capa === 'controller') {
        // R2. Un controller nunca habla con la base de datos (ni TypeORM ni entidades)
        if (LIBRERIAS_DE_DATOS.includes(imp) || capaImp === 'entity') {
          v.push(`R2 ${a.ruta}: el controller se salta al service y usa ${imp}`);
        }
        // R3. Un controller solo usa el service de su propio módulo
        if (capaImp === 'service' && moduloImp !== a.modulo) {
          v.push(`R3 ${a.ruta}: usa el service de otro módulo (${imp})`);
        }
      }

      // R4. Nadie depende de un controller, salvo el .module que lo registra
      if (capaImp === 'controller' && !(a.capa === 'module' && moduloImp === a.modulo)) {
        v.push(`R4 ${a.ruta}: depende del controller ${imp}`);
      }

      // R5. La dependencia va hacia abajo: un service no conoce módulos de Nest de otros
      if (a.capa === 'service' && capaImp === 'module') {
        v.push(`R5 ${a.ruta}: un service no puede importar ${imp}`);
      }

      // R6. Las entidades solo conocen a TypeORM, a common y a otras entidades
      if (a.capa === 'entity' && esInterno(imp) && capaImp !== 'entity' && capaImp !== 'common') {
        v.push(`R6 ${a.ruta}: la entidad depende de una capa superior (${imp})`);
      }

      // R7. Los DTO no conocen services, controllers, entidades ni la base de datos
      if (a.capa === 'dto') {
        const prohibido = capaImp === 'service' || capaImp === 'controller' || capaImp === 'entity' || capaImp === 'module' || LIBRERIAS_DE_DATOS.includes(imp);
        if (prohibido) v.push(`R7 ${a.ruta}: el DTO depende de ${imp}`);
      }
    }
  }

  // R8. No hay ciclos entre services (A usa B y B usa A)
  const services = archivos.filter((a) => a.capa === 'service');
  const usa = new Map(services.map((s) => [s.ruta, s.imports.filter((i) => esInterno(i) && capaDe(i) === 'service')]));
  const visitar = (actual: string, camino: string[]) => {
    for (const siguiente of usa.get(actual) ?? []) {
      if (camino.includes(siguiente)) {
        v.push(`R8 ciclo entre services: ${[...camino.slice(camino.indexOf(siguiente)), siguiente].join(' -> ')}`);
      } else {
        visitar(siguiente, [...camino, siguiente]);
      }
    }
  };
  services.forEach((s) => visitar(s.ruta, [s.ruta]));

  return [...new Set(v)];
}

describe('Arquitectura: capas separadas y sin atajos', () => {
  const archivos = leerProyecto();

  it('encuentra los archivos de todas las capas', () => {
    const capas = new Set(archivos.map((a) => a.capa));
    for (const capa of ['controller', 'service', 'entity', 'dto', 'module', 'common']) {
      expect(capas, `falta la capa ${capa}`).toContain(capa);
    }
  });

  it('el código real no tiene ninguna violación (R1–R8)', () => {
    expect(buscarViolaciones(archivos)).toEqual([]);
  });

  it('R9. Las reglas clínicas tienen un único punto de entrada: solo CasesService usa TriageService', () => {
    const usanTriage = archivos.filter((a) => a.modulo !== 'triage' && a.imports.includes('triage/triage.service.ts')).map((a) => a.ruta);
    expect(usanTriage).toEqual(['cases/cases.service.ts']);
  });

  it('R10. El cálculo clínico (TriageService) no depende de ningún otro service', () => {
    const triage = archivos.find((a) => a.ruta === 'triage/triage.service.ts');
    const otrosServices = triage?.imports.filter((i) => esInterno(i) && capaDe(i) === 'service');
    expect(otrosServices).toEqual([]);
  });

  // ---- Estas pruebas demuestran que el verificador SÍ detecta atajos (no es una prueba vacía) ----

  it('detecta un controller que consulta la base de datos directamente', () => {
    const atajo: Archivo = {
      ruta: 'cases/cases.controller.ts',
      capa: 'controller',
      modulo: 'cases',
      imports: ['@nestjs/common', '@nestjs/typeorm', 'cases/entities/case.entity.ts'],
    };
    const violaciones = buscarViolaciones([atajo]);
    expect(violaciones.some((x) => x.startsWith('R2'))).toBe(true);
  });

  it('detecta una entidad que depende de un service y un ciclo entre services', () => {
    const falsos: Archivo[] = [
      { ruta: 'a/a.entity.ts', capa: 'entity', modulo: 'a', imports: ['a/a.service.ts'] },
      { ruta: 'a/a.service.ts', capa: 'service', modulo: 'a', imports: ['b/b.service.ts'] },
      { ruta: 'b/b.service.ts', capa: 'service', modulo: 'b', imports: ['a/a.service.ts'] },
    ];
    const violaciones = buscarViolaciones(falsos);
    expect(violaciones.some((x) => x.startsWith('R6'))).toBe(true);
    expect(violaciones.some((x) => x.startsWith('R8'))).toBe(true);
  });

  it('muestra el mapa de dependencias entre módulos (evidencia para el diagrama C4)', () => {
    const mapa = new Map<string, Set<string>>();
    for (const a of archivos) {
      for (const imp of a.imports.filter(esInterno)) {
        const destino = moduloDe(imp);
        if (destino !== a.modulo && a.modulo !== 'raiz') {
          const tipo = capaDe(imp) === 'entity' ? `${destino} (entidad)` : destino;
          if (!mapa.has(a.modulo)) mapa.set(a.modulo, new Set());
          mapa.get(a.modulo)!.add(tipo);
        }
      }
    }
    const lineas = [...mapa.entries()].sort().map(([m, deps]) => `  ${m.padEnd(12)} -> ${[...deps].sort().join(', ')}`);
    console.log('\nDependencias entre módulos:\n' + lineas.join('\n') + '\n');
    expect(mapa.get('common')).toBeUndefined(); // common no depende de nadie
  });
});
