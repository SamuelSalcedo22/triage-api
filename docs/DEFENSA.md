# Guía de defensa — 7 min de exposición + 3 de preguntas

> Para el equipo: estúdienla **con sus propias palabras**. Cada respuesta remite a un driver del árbol de utilidad
> ([DISENO.md §2](DISENO.md#2-drivers-priorizados)) y a una medida real del esqueleto ([evidencias/REPORTE.md](../evidencias/REPORTE.md)).

## Guion sugerido (7 minutos)

| Min | Quién | Qué | Diapositiva |
|---|---|---|---|
| 0:00 | Integrante 1 | Dominio y por qué no es un CRUD | 1–3 |
| 1:00 | Integrante 1 | Árbol de utilidad: las tres hojas ★ y lo que se dejó como deuda | 4–5 |
| 2:00 | Integrante 2 | Escenarios E1, E2 y E3 con sus medidas | 6 |
| 2:45 | Integrante 2 | Estilo, alternativas descartadas y qué sacrifica | 7–8 |
| 3:45 | Integrante 2 | Contextos y tácticas | 9–10 |
| 4:30 | Integrante 3 | C4 nivel 1 y 2 | 11–12 |
| 5:15 | Integrante 3 | **Demo en vivo** (ver abajo) | 14 |
| 6:30 | Integrante 3 | Riesgos y qué se rompe con 10x | 15–16 |

## Demo en vivo (≈ 75 s)

Antes de entrar a la sustentación: abrir Docker Desktop y correr `npm run levantar` (o tenerlo ya arriba).

1. `docker compose ps` → se ven los contenedores. `GET /api/v1/health` en Swagger → 200 con `database: up`.
2. `npm run demo`: script de PowerShell que crea usuarios y casos, y muestra la cola ordenada ALTA → MEDIA → BAJA.
3. `npm run test:arq` → las reglas R1–R10 pasan, o sea, **las capas están separadas de verdad**.
4. Si sobra tiempo: `npm run test:e2e`. La prueba "10. Concurrencia" es la de los dos especialistas en paralelo.

**Plan B si falla la red o Docker:** mostrar [evidencias/REPORTE.md](../evidencias/REPORTE.md) y la carpeta `resultados/`, que tienen la salida real de todas las pruebas.

---

## Las 4 preguntas, decisión por decisión

### Decisión 1 — Monolito modular en capas (ADR-001)

**¿Qué driver la justifica y de dónde salió?**
E1 (corrección clínica, A,M) y E2 (concurrencia, A,M). E1 sale del negocio: el error más caro es que un caso grave quede
abajo en la bandeja de un especialista que revisa decenas al día. E2 sale de que los especialistas comparten una sola cola.
Las dos se resuelven con una transacción local y un `UPDATE` atómico, y eso requiere una sola BD y un solo proceso.

**¿Qué alternativa descartaron y por qué?**
- **Microservicios**: el caso y su triage quedarían en servicios distintos, así que guardar las dos cosas juntas sería una transacción distribuida (saga). Con eso podría haber un caso visible sin prioridad. Además, somos 3 personas y ningún driver pide escalar por separado.
- **Eventos**: el promotor necesita la prioridad en la respuesta para decidir si remite ya.

**¿Qué atributo empeoró y por qué es aceptable?**
La **escalabilidad independiente**. Lo medimos: con 10x casos la cola pasa de p99 177 ms a 1789 ms. Es aceptable porque hoy
hay decenas de casos al día (1x cumple con holgura) y la primera mitigación, paginar e indexar la cola, no exige cambiar de estilo.

### Decisión 2 — Triage síncrono y en una transacción (ADR-002)

**¿Qué driver?**
E1, más la Res. 2654/2019: la decisión clínica es del profesional y el promotor tiene que saber en el momento si el caso es ALTA.

**¿Qué alternativa?**
- **Triage asíncrono por cola de mensajes**: el cálculo mide p99 de 32 ms, no hay lentitud que lo justifique, y abriría una ventana con casos sin prioridad.
- **Calcular en el cliente**: no es confiable y duplica las reglas en cada cliente.

**¿Qué empeoró?**
La **latencia del registro** (p99 de 231 ms a 1x y de 1541 ms a 10x) y el **acoplamiento**: Triage recibe el `EntityManager`
de quien lo llama. Es aceptable porque un registro de un segundo y medio sigue siendo usable en campo, y un caso grave
guardado como BAJA no es aceptable.

**Dato para lucirse:** la primera versión **no** era atómica. Lo descubrimos documentando el riesgo, y la prueba de
concurrencia demostró además la doble asignación: con el código viejo daba `[200, 200]`.

### Decisión 3 — Reglas clínicas en código con pruebas (ADR-003)

**¿Qué driver?**
E3 (modificabilidad, A,B) **y** E1. Los umbrales van a cambiar cuando el médico los valide, y cada cambio debe quedar probado antes de llegar a un paciente.

**¿Qué alternativa?**
- **Tabla de umbrales en la BD**: cambiar sin redesplegar (E3b) es de importancia baja, y un umbral mal editado en producción no tendría ninguna prueba que lo atrape.
- **Motor de reglas**: es otro lenguaje que aprender, son más difíciles de probar y no lo justifican unas 25 reglas.
- **Servicio externo**: pone una dependencia de red en el camino crítico y envía datos sensibles a un tercero.

**¿Qué empeoró?**
La **modificabilidad en caliente**: cada cambio necesita un desarrollador y un redespliegue. Además, `TriageService` crece.
Es aceptable porque los cambios son pocos y deben revisarse con cuidado de todos modos.

### Tácticas (preguntas rápidas)

| Táctica | Driver | Qué degrada |
|---|---|---|
| UPDATE condicional al asignar | E2 | El segundo especialista recibe un 409 |
| Validación en el borde | E1, E6 | Un valor extremo pero real se rechaza |
| Desnormalizar la prioridad en `Case` | E4 | Hay dos copias y cada evaluación hace 2 escrituras |
| Health check + degradación parcial | E5 | Cada `/health` consulta la BD |

---

## "Si el negocio creciera diez veces, ¿qué se rompería primero?"

**La cola del especialista (`GET /triage/queue`).** No es una suposición, está medido con `npm run test:carga`:

| Operación | p99 a 1x | p99 a 10x | Veces más lento |
|---|---|---|---|
| **Cola (100 → 1000 casos abiertos)** | 177 ms | **1789 ms** | **10,1** ← se rompe primero (límite 500 ms) |
| Registro de casos (10 → 100 promotores) | 231 ms | 1541 ms | 6,7 |
| Evaluación (10 → 100 usuarios) | 32 ms | 154 ms | 4,8 |

**Por qué:** la cola devuelve **todos** los casos abiertos con sus relaciones (1,2 MB con 1000 casos) y los ordena sin
índice. Crece de forma lineal con el número de casos.

**Qué haríamos, en orden:**
1. Paginación (`?limit=50`) más un índice compuesto `(status, priority, news2_score, created_at)`. No cambia el estilo.
2. Pool de conexiones más grande y réplicas de lectura de PostgreSQL para la cola.
3. Solo si eso no basta: extraer la cola o el triage como servicio aparte. Eso implica revisar ADR-001 y ADR-002, empezando por separar el esquema de BD de ese contexto.

**Lo segundo que se rompería:** el registro de casos, porque la transacción mantiene la conexión ocupada mientras hace 3
escrituras, y con 100 promotores simultáneos el pool de conexiones se agota.

---

## Preguntas trampa probables

- **"¿Esto no es un CRUD?"** No. Tiene NEWS2 con dos escalas, la regla de "parámetro en rojo", la regla de "prioridad más grave", detección de negación en texto libre, una máquina de estados con transiciones prohibidas, concurrencia en la cola y normativa (Res. 2654, Ley 1581, Res. 1995).
- **"¿Cómo sé que las capas están separadas?"** `npm run test:arq` lee los `import` de todo `src/` y falla si un controller toca la BD, si hay un ciclo entre services o si alguien que no es `CasesService` llama a `TriageService`. La misma prueba incluye casos inventados con violaciones para demostrar que **sí** las detecta.
- **"¿Por qué no hay autenticación?"** Es el riesgo R3, documentado. El esqueleto demuestra la estructura, y el plan es JWT + `RolesGuard` tomando el usuario del token. No cambia el estilo: es una capa transversal más de Nest.
- **"¿Usaron IA?"** Sí, como permite el proyecto. Pero las decisiones salen del árbol de utilidad, y las medidas (177 ms, 1789 ms, 607 ms, `[200, 200]`) son de nuestras corridas, reproducibles con `npm run test:todo`.
