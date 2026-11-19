# ADR-001 — Monolito modular en capas

## 1. Estado

**Aceptado**. Fecha: noviembre de 2026. Drivers relacionados: E1 (A,M), E2 (A,M) y E3 (A,B), más la restricción de equipo y plazo.

## 2. Contexto

- El sistema debe **guardar un caso y su prioridad como una sola cosa**. Un caso visible en la cola sin prioridad, o con la prioridad por defecto (BAJA), es el peor error posible del dominio (E1).
- Varios especialistas comparten **una cola** y no puede haber dobles asignaciones (E2).
- Las reglas clínicas van a cambiar cuando el médico asesor las valide (E3).
- Somos 3 personas con 3 semanas, la materia exige NestJS y hay una sola base de datos PostgreSQL.
- La carga esperada es de decenas de casos al día. La prueba de carga mostró holgura a 1x: la cola tiene p99 de 177 ms con un límite de 500 ms.

## 3. Decisión

Construir **un solo proceso NestJS** con:

- **Un módulo por contexto delimitado**: `users`, `patients`, `cases`, `triage`, `attachments`, más `health` de soporte.
- **Capas dentro de cada módulo**: Controller → Service → Entity/Repository. La dependencia apunta solo hacia abajo.
- **Las reglas se verifican con código**: `test/arquitectura/arquitectura.spec.ts` (R1–R10) falla si aparece un atajo. Por ejemplo, un controller que use TypeORM, un ciclo entre services o alguien que no sea `CasesService` llamando a `TriageService`.

## 4. Alternativas descartadas

| Alternativa | Lo que ofrecía | Por qué se descartó |
|---|---|---|
| **Microservicios** (servicio de Casos, servicio de Triage y servicio de Pacientes, cada uno con su BD) | Escalar y desplegar cada parte por separado; aislar fallos | Crear un caso + su triage sería una **transacción distribuida** (saga, compensaciones, consistencia eventual), justo contra E1. La asignación concurrente (E2) necesitaría coordinación entre servicios. Nadie en el árbol de utilidad pide escalar por separado hoy, y con 3 personas el costo de operar varios servicios (red, despliegues, trazas) supera el beneficio |
| **Arquitectura dirigida por eventos** (el caso publica `CasoRegistrado` y un consumidor calcula el triage) | Desacoplar el registro del cálculo y agregar consumidores después (notificaciones, estadísticas) | El promotor necesita **la prioridad en la misma respuesta**: si es ALTA, remite al paciente en ese momento. Con eventos habría una ventana en que el caso existe sin prioridad, y se agregaría un broker de mensajes |
| **Hexagonal / Clean Architecture completa** (puertos y adaptadores, dominio sin TypeORM) | Dominio totalmente independiente de la BD y del framework | Ningún driver de alta importancia exige cambiar la BD o el framework. Duplicaría los modelos (dominio + ORM) en un plazo de 3 semanas. Se adoptó solo la parte que sí paga: el cálculo clínico no usa BD ni HTTP |

## 5. Consecuencias

**Buenas**
- Transacciones locales y `UPDATE` atómicos con PostgreSQL resuelven E1 y E2 sin infraestructura extra (T1, T2).
- Arranca con un solo comando (`npm run levantar`) y se depura en un solo proceso.
- Las fronteras entre módulos están **verificadas por una prueba**, no solo dibujadas.

**Malas (aceptadas)**
- **No se puede escalar solo la cola.** Medido: con 10x casos abiertos el p99 de la cola sube de 177 ms a **1789 ms**, y con ella se ralentiza todo el proceso.
- **Un fallo grave afecta a todos los módulos.** Se atenúa con el filtro global de excepciones y la degradación parcial (E5).
- **Las entidades se referencian entre contextos** porque hay una sola BD (por ejemplo, `TriageRecord → Case`). Para extraer un contexto como servicio primero habría que separar su esquema.
- **Cambiar una regla clínica redespliega toda la API.**

**Cuándo revisar esta decisión:** si un contexto (probablemente Triage o la cola) necesita escalar o desplegarse aparte, o si
otro sistema (por ejemplo, una historia clínica electrónica) necesita reaccionar a los casos. En ese caso se evaluaría
extraer Triage como servicio o publicar eventos **después** de guardar el caso con la transacción.
