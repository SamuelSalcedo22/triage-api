# Reporte de pruebas — API de Triage

- **Fecha:** 10/11/2026, 10:51:06 p. m.
- **Equipo:** 13th Gen Intel(R) Core(TM) i5-13450HX, 16 núcleos, 16 GB RAM, Windows_NT 10.0.26200
- **Node.js:** v22.23.4 · PostgreSQL 16 en Docker
- **Cómo se generó:** `npm run test:todo`

## Resumen

| Prueba | Resultado | Detalle | Duración | Qué demuestra |
|---|---|---|---|---|
| 1. Pruebas unitarias (reglas clínicas) | ✅ PASA | 12 de 12 pruebas pasan | 9.0 s | El cálculo NEWS2 y las reglas de hipertensión, diabetes y síntomas dan la prioridad correcta. |
| 2. Prueba de arquitectura (capas sin atajos) | ✅ PASA | 7 de 7 pruebas pasan | 6.4 s | Las dependencias van en una sola dirección: Controller → Service → Entity. Ningún controller toca la base de datos. |
| 3. Prueba de punta a punta (esqueleto) | ✅ PASA | 27 de 27 pruebas pasan | 12.0 s | Una petición HTTP atraviesa todas las capas hasta PostgreSQL y vuelve; las reglas de negocio se cumplen. |
| 4. Prueba de carga (1x contra 10x) | ✅ PASA | 3 de 3 límites cumplidos | 91.7 s | El escenario de rendimiento se cumple con carga normal y se sabe qué se degrada primero al crecer 10 veces. |
| 5. Prueba de disponibilidad (caída de la BD) | ✅ PASA | 8 de 8 verificaciones cumplidas | 12.4 s | Si se cae la base de datos la API no se cae, lo detecta y se recupera sola. |


## 1. Pruebas unitarias

Comando: `npm run test:unit`

- ✅ signos normales → NEWS2 0 y prioridad BAJA
- ✅ NEWS2 ≥ 7 → ALTA
- ✅ NEWS2 5–6 → MEDIA
- ✅ un solo parámetro con 3 puntos → MEDIA aunque el total sea bajo
- ✅ Escala 2 de SpO2: 90% sin oxígeno no suma puntos en paciente con EPOC hipercápnico
- ✅ PA ≥180/110 con síntomas de órgano blanco → ALTA (emergencia hipertensiva)
- ✅ PA ≥180/110 sin síntomas → MEDIA (urgencia hipertensiva)
- ✅ hipoglucemia < 54 → ALTA
- ✅ hipoglucemia 54–69 → MEDIA
- ✅ glucosa > 600 → ALTA
- ✅ ignora síntomas negados ("niega dolor de pecho")
- ✅ detecta síntomas de alarma sin importar tildes ni mayúsculas

## 2. Prueba de arquitectura

Comando: `npm run test:arq`

- ✅ encuentra los archivos de todas las capas
- ✅ el código real no tiene ninguna violación (R1–R8)
- ✅ R9. Las reglas clínicas tienen un único punto de entrada: solo CasesService usa TriageService
- ✅ R10. El cálculo clínico (TriageService) no depende de ningún otro service
- ✅ detecta un controller que consulta la base de datos directamente
- ✅ detecta una entidad que depende de un service y un ciclo entre services
- ✅ muestra el mapa de dependencias entre módulos (evidencia para el diagrama C4)

Dependencias reales entre módulos (extraídas de los `import` del código):

```
  attachments  -> cases (entidad), common, raiz, users, users (entidad)
  cases        -> attachments (entidad), common, patients, patients (entidad), triage, triage (entidad), users, users (entidad)
  patients     -> cases (entidad), common
  triage       -> cases, cases (entidad), common, patients (entidad)
  users        -> cases (entidad), common
```

## 3. Prueba de punta a punta

Comando: `npm run test:e2e` · usa la base de datos `triage_e2e`, que se crea vacía en cada ejecución.

- ✅ 1. El sistema arranca y está conectado a la base de datos › GET /health responde 200 con la base de datos arriba
- ✅ 2. Tipos de usuario y pacientes › crea un promotor y dos especialistas
- ✅ 2. Tipos de usuario y pacientes › crea un paciente hipertenso y diabético y calcula su edad
- ✅ 2. Tipos de usuario y pacientes › rechaza un paciente con documento repetido (409)
- ✅ 3. Crear un caso dispara el triage automáticamente y lo guarda › PA 192/112 + cefalea intensa → ALTA por sospecha de emergencia hipertensiva
- ✅ 3. Crear un caso dispara el triage automáticamente y lo guarda › un solo parámetro en rojo (SpO2 91 %) → MEDIA
- ✅ 3. Crear un caso dispara el triage automáticamente y lo guarda › signos normales → BAJA
- ✅ 3. Crear un caso dispara el triage automáticamente y lo guarda › el caso quedó guardado en la BD con sus signos y su registro de triage
- ✅ 4. La cola del especialista sale ordenada por prioridad › GET /triage/queue devuelve ALTA → MEDIA → BAJA aunque se crearon en otro orden
- ✅ 5. La entrada se valida antes de llegar a la lógica › rechaza signos vitales imposibles (SpO2 150 %) con 400
- ✅ 5. La entrada se valida antes de llegar a la lógica › rechaza campos que no existen en el DTO (400)
- ✅ 5. La entrada se valida antes de llegar a la lógica › rechaza sistólica menor que diastólica (400)
- ✅ 5. La entrada se valida antes de llegar a la lógica › todos los errores tienen el mismo formato
- ✅ 6. Reglas de negocio por tipo de usuario › un especialista no puede registrar casos (solo el promotor)
- ✅ 6. Reglas de negocio por tipo de usuario › un promotor no puede tomar casos de la cola
- ✅ 6. Reglas de negocio por tipo de usuario › la especialista A toma el caso → EN_REVISION
- ✅ 6. Reglas de negocio por tipo de usuario › el especialista B no puede tomar el mismo caso (409)
- ✅ 6. Reglas de negocio por tipo de usuario › la cola le muestra a cada uno qué caso es suyo y cuáles están disponibles
- ✅ 7. Ciclo de vida del caso › no se puede marcar ATENDIDO sin notas del especialista (400)
- ✅ 7. Ciclo de vida del caso › con notas pasa a ATENDIDO y sale de la cola
- ✅ 7. Ciclo de vida del caso › no permite transiciones inválidas (ATENDIDO → DERIVADO)
- ✅ 8. Reevaluación: nuevos signos cambian la prioridad y el orden de la cola › POST /triage/evaluate con hipoglucemia (45 mg/dL) sube el caso BAJA a ALTA
- ✅ 8. Reevaluación: nuevos signos cambian la prioridad y el orden de la cola › la cola se reordena: el caso reevaluado ahora va primero
- ✅ 8. Reevaluación: nuevos signos cambian la prioridad y el orden de la cola › queda el historial de las dos evaluaciones
- ✅ 9. Adjuntos (ECG, fotos, historia clínica) › sube un PDF y lo asocia al caso
- ✅ 9. Adjuntos (ECG, fotos, historia clínica) › rechaza tipos de archivo no permitidos (400)
- ✅ 9. Adjuntos (ECG, fotos, historia clínica) › descarga exactamente el mismo archivo que se subió

## 4. Prueba de carga: 1x contra 10x

Comando: `npm run test:carga` · API propia en el puerto 3100 y base de datos `triage_carga`. Cada medición dura 8 s.

### Escenario de rendimiento con carga normal (1x)

| escenario | límite p99 ms | medido p99 ms | errores | resultado |
|---|---|---|---|---|
| B. GET /triage/queue · 100 casos (1x) | 500 | 177 | 0 | CUMPLE |
| A. POST /triage/evaluate · 10 usuarios (1x) | 200 | 32 | 0 | CUMPLE |
| C. POST /cases · 10 promotores (1x) | 500 | 231 | 0 | CUMPLE |

### Todas las mediciones

| nombre | conexiones | req/s | p50 ms | p97.5 ms | p99 ms | máx ms | errores |
|---|---|---|---|---|---|---|---|
| B. GET /triage/queue · 100 casos (1x) | 10 | 77 | 127 | 171 | 177 | 186 | 0 |
| B. GET /triage/queue · 1000 casos (10x) | 10 | 7 | 1411 | 1728 | 1789 | 1789 | 0 |
| A. POST /triage/evaluate · 10 usuarios (1x) | 10 | 680 | 12 | 23 | 32 | 837 | 0 |
| A. POST /triage/evaluate · 100 usuarios (10x) | 100 | 959 | 100 | 142 | 154 | 179 | 0 |
| C. POST /cases · 10 promotores (1x) | 10 | 67 | 150 | 186 | 231 | 303 | 0 |
| C. POST /cases · 100 promotores (10x) | 100 | 75 | 1083 | 1535 | 1541 | 1563 | 0 |

### ¿Qué se degrada más al crecer 10 veces?

| operación | req/s 1x | req/s 10x | p99 1x ms | p99 10x ms | veces más lento | errores 10x |
|---|---|---|---|---|---|---|
| B. Cola (10x casos abiertos) | 77 | 7 | 177 | 1789 | 10.1 | 0 |
| A. Evaluación (10x usuarios) | 680 | 959 | 32 | 154 | 4.8 | 0 |
| C. Registro de casos (10x promotores) | 67 | 75 | 231 | 1541 | 6.7 | 0 |

Tamaño de la respuesta de la cola: **100 casos = 124 KB** · **1000 casos = 1244 KB** (la cola no tiene paginación).

## 5. Prueba de disponibilidad: caída de la base de datos

Comando: `npm run test:disponibilidad`

| verificación | resultado | detalle |
|---|---|---|
| Estado normal | CUMPLE | /health = 200 y se registró 1 caso |
| Detecta la falla | CUMPLE | /health pasó a 503 en 15 ms |
| Degradación parcial: el cálculo de triage sigue funcionando sin BD | CUMPLE | POST /triage/evaluate → 200 (ALTA) en 9 ms |
| Lo que necesita BD falla de forma controlada | CUMPLE | GET /triage/queue → 500 con el formato de error estándar en 19 ms |
| La API no se cae | CUMPLE | el proceso sigue vivo con la BD apagada |
| Se recupera sola, sin reiniciar la API | CUMPLE | /health volvió a 200 en 607 ms desde "docker start" |
| No se perdieron datos | CUMPLE | la cola volvió a responder 200 con 1 caso |
| Vuelve a aceptar escrituras | CUMPLE | POST /cases → 201 |

