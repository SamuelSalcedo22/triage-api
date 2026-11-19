# ADR-002 — Triage síncrono dentro de la misma transacción que registra el caso

## 1. Estado

**Aceptado**. Fecha: noviembre de 2026. Drivers relacionados: E1 (A,M) y la restricción de la Resolución 2654 de 2019 (la decisión es del profesional, que necesita la información a tiempo).

## 2. Contexto

Cuando el promotor registra un caso hay tres escrituras: el **caso**, la **toma de signos vitales** y el **registro de triage**
(que además actualiza la prioridad del caso). El promotor está frente al paciente y necesita saber en ese momento si el caso
es ALTA para remitirlo. El especialista ordena su bandeja por la prioridad guardada.

En la primera versión del esqueleto las tres escrituras eran **independientes**. Si fallaba la tercera, el caso quedaba
guardado con la prioridad por defecto, **BAJA**: un caso posiblemente grave al final de la cola.

## 3. Decisión

- El triage se calcula **de forma síncrona** dentro de `POST /cases`, y la respuesta trae la prioridad y las alertas.
- Las tres escrituras ocurren en **una transacción de PostgreSQL** (`dataSource.transaction`). `TriageService.evaluateAndSave` recibe el `EntityManager` de la transacción. O queda todo guardado, o no queda nada y el promotor recibe un error y reintenta.
- El cálculo en sí (`calculateRisk`) no toca la BD, así que también se ofrece sin guardar (`POST /triage/evaluate` sin `caseId`). Eso es lo que sigue funcionando cuando cae la BD (E5).

## 4. Alternativas descartadas

| Alternativa | Lo que ofrecía | Por qué se descartó |
|---|---|---|
| **Triage asíncrono con cola de mensajes** (guardar el caso y encolar un trabajo que calcula después) | Respuesta de registro más rápida; el cálculo podría escalar aparte | El promotor **no recibe la prioridad** en el momento. Además, el caso aparece en la cola del especialista sin prioridad real hasta que corra el trabajo. El cálculo mide p99 de 32 ms, así que no hay lentitud que justifique sacarlo de la petición |
| **Calcular en el cliente** (la app del promotor calcula NEWS2 y envía la prioridad) | Funciona sin conexión | La prioridad dejaría de ser confiable: un cliente viejo o manipulado podría mandar BAJA para un caso grave, y habría reglas duplicadas en cada cliente. Las reglas deben tener **un solo dueño** (E3) |
| **Mantener las escrituras separadas y "arreglar" después** (tarea que busca casos sin triage) | Código más simple | Deja una ventana real en la que un caso grave figura como BAJA. Contradice directamente E1 |

## 5. Consecuencias

**Buenas**
- **No existe un caso sin triage**: si algo falla, no queda nada a medias.
- El promotor ve la prioridad y las alertas en la misma respuesta. Medido: p99 de `POST /cases` = 231 ms con 10 promotores.
- Las reglas clínicas tienen un solo lugar donde se ejecutan con los datos guardados.

**Malas (aceptadas)**
- **La latencia del registro incluye el cálculo y tres escrituras.** Con 10x promotores el p99 sube a **1541 ms** (medido): sigue siendo usable, pero ya no es instantáneo.
- **Acoplamiento**: `TriageService` conoce el `EntityManager` de quien lo llama. Ya no es independiente de la forma de persistir.
- **Si la BD no está disponible no se puede registrar**, y el promotor en campo solo puede usar la evaluación sin guardar. El modo sin conexión con sincronización posterior (E7) queda fuera de alcance.
- La transacción mantiene la conexión ocupada más tiempo, con lo que el pool de conexiones se agota antes bajo mucha carga.
