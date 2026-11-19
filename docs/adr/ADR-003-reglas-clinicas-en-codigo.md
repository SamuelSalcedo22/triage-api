# ADR-003 — Reglas clínicas codificadas en un único servicio, con pruebas en las fronteras

## 1. Estado

**Aceptado**. Fecha: noviembre de 2026. Drivers relacionados: E1 (A,M), E3 (A,B) y E3b (B,A, descartado conscientemente), más la restricción NEWS2 como estándar externo.

## 2. Contexto

La prioridad sale de cuatro fuentes de reglas: **NEWS2** (tablas fijas del Royal College of Physicians), **hipertensión**
(ESH 2023), **glucemia** (ADA) y **síntomas en texto libre** (palabras clave con detección de negación). La prioridad final
es la más grave de todas. Los umbrales todavía no los ha validado el médico asesor, así que **van a cambiar**. Pero un error
en una frontera (por ejemplo, usar `<` en lugar de `<=` en SpO₂ 91) cambia la prioridad de un paciente real.

## 3. Decisión

- Las reglas se escriben **en código TypeScript** dentro de `TriageService`, en métodos con nombre propio: `applyNews2Rules`, `applyHypertensionRules`, `applyDiabetesRules`, `detectRedFlagSymptoms` y `calculateRisk`.
- **Un único punto de entrada**: solo `CasesService` usa `TriageService` (regla R9), y `TriageService` no depende de ningún otro service (R10). Las dos reglas se verifican en `npm run test:arq`.
- Cada regla tiene **pruebas unitarias en sus valores de frontera** (12) y pruebas e2e del flujo completo (28).
- Cada umbral lleva en un comentario la fuente que lo justifica.

## 4. Alternativas descartadas

| Alternativa | Lo que ofrecía | Por qué se descartó |
|---|---|---|
| **Reglas en la base de datos** (tabla de umbrales editable desde un panel de administración) | Cambiar umbrales **sin redesplegar** (E3b) | E3b es (B,A): baja importancia y alta dificultad. Un umbral clínico mal editado en producción no tendría **prueba que lo atrape** antes de afectar pacientes. Además, NEWS2 no es solo una lista de umbrales: tiene escalas alternativas y combinaciones (parámetro rojo, escala 2 solo con oxígeno) que una tabla genérica no expresa bien |
| **Motor de reglas genérico** (por ejemplo, `json-rules-engine` o un DSL) | Separar las reglas del código y permitir que las escriba alguien que no programa | Agrega una dependencia y un lenguaje nuevo que el equipo y el médico tendrían que aprender. Las reglas se vuelven más difíciles de **depurar y probar** que una función. El número de reglas (unas 25) no lo justifica |
| **Delegar el cálculo a un servicio externo** (calculadora clínica de terceros) | No mantener las reglas | No hay un servicio así integrable para nuestra combinación NEWS2 + HTA + DM. Crearía una dependencia de red en el camino crítico (contra E1 y E5) y enviaría datos sensibles a un tercero (Ley 1581) |

## 5. Consecuencias

**Buenas**
- Cambiar un umbral es tocar **1 archivo de producción** + su prueba (E3, medida cumplida).
- Las fronteras están probadas: un error de `<` por `<=` hace fallar una prueba antes del despliegue.
- Las reglas son **auditables**: el código, el comentario con la fuente y el historial de git dicen quién cambió qué y por qué. Eso encaja con la trazabilidad que pide la historia clínica.

**Malas (aceptadas)**
- **Cada cambio de umbral requiere un desarrollador y un redespliegue** (E3b no se cumple). El médico asesor no puede ajustar solo.
- **`TriageService` crece** con cada regla nueva y concentra mucha lógica. Si llegara a 3–4 familias de reglas más, se partiría en una clase por familia detrás del mismo punto de entrada.
- **La detección de síntomas por palabras clave es frágil** (riesgo R4): no entiende regionalismos ni errores de ortografía. Se acepta porque es una alerta adicional (MEDIA) y nunca la única fuente de la prioridad.
