# API de Triage y Priorización de Casos Clínicos

API REST hecha con **NestJS + TypeORM + PostgreSQL**. Recibe los signos vitales y síntomas que toma el
promotor de salud en campo (Pasto, Nariño), calcula el riesgo con **NEWS2** más reglas de **hipertensión**
y **diabetes**, y ordena la bandeja del médico especialista por prioridad **ALTA / MEDIA / BAJA**.

> ⚠️ Es una herramienta de apoyo a la decisión clínica: **no reemplaza el criterio médico**.
> Los umbrales deben ser validados por el médico asesor del proyecto.

---

## 1. Requisitos

| Herramienta | Versión | Comprobar |
|---|---|---|
| Node.js | 22 LTS o superior | `node -v` |
| npm | 10+ | `npm -v` |
| Docker Desktop | encendido | `docker ps` |

Recomendado: VS Code y la extensión *Thunder Client* o Postman (opcional, también se puede probar con Swagger).

---

## 2. Cómo correr la API paso a paso

### Paso 1 – Instalar dependencias

```bash
npm install
```

> El archivo `.npmrc` trae `legacy-peer-deps=true` para evitar un error de npm 10 con las dependencias de Vitest.

### Paso 2 – Crear el archivo `.env`

Copia el ejemplo (en PowerShell: `copy .env.example .env`):

```bash
cp .env.example .env
```

Los valores por defecto ya coinciden con `docker-compose.yml`, no hace falta cambiarlos.

### Paso 3 – Levantar la base de datos

Abre Docker Desktop y espera a que diga *Engine running*. Luego:

```bash
docker compose up -d
```

Esto crea dos contenedores:

| Servicio | URL / Puerto | Credenciales |
|---|---|---|
| PostgreSQL 16 | `localhost:5433` | usuario `triage_user`, clave `triage_password`, BD `triage_db` |
| pgAdmin (ver tablas) | http://localhost:5050 | `admin@triage.com` / `admin_password` |

> Se usa el puerto **5433** para no chocar con otro Postgres que tengas en el 5432 (por ejemplo el del proyecto de clase).
> En pgAdmin, para registrar el servidor usa host `postgres`, puerto `5432` (dentro de Docker).

### Paso 4 – Arrancar la API

```bash
npm run start:dev
```

Cuando veas:

```
API corriendo en      http://localhost:3000/api/v1
Swagger disponible en http://localhost:3000/api/docs
```

ya está lista. Las tablas se crean solas (`synchronize: true`). El modo `start:dev` reinicia la API cada vez que guardas un archivo.

### Paso 5 – Probar en Swagger

Abre **http://localhost:3000/api/docs**, despliega un endpoint, pulsa **Try it out**, edita el JSON y **Execute**.
Todos los DTOs traen ejemplos realistas ya llenos.

### Paso 6 – Correr las pruebas unitarias

```bash
npm run test
```

Prueban el cálculo de NEWS2 y las reglas HTA / diabetes / síntomas (12 casos).

### Apagar todo

`Ctrl + C` detiene la API. Para la base de datos:

```bash
docker compose down
```

(`docker compose down -v` además **borra** los datos para empezar de cero.)

---

## 3. Flujo de demostración (en este orden)

1. **Crear usuarios** – `POST /api/v1/users`
   ```json
   { "fullName": "Pedro Promotor", "email": "pedro@triage.com", "role": "PROMOTOR" }
   ```
   ```json
   { "fullName": "Dra. Laura Martínez", "email": "laura@triage.com", "role": "ESPECIALISTA", "specialty": "Medicina interna" }
   ```
2. **Crear paciente** – `POST /api/v1/patients` (el ejemplo de Swagger sirve tal cual).
3. **Crear caso** – `POST /api/v1/cases`. El triage se calcula **automáticamente**:
   ```json
   {
     "patientId": 1,
     "createdById": 1,
     "reasonForConsultation": "Control de hipertensión y diabetes",
     "symptoms": "Refiere dolor de cabeza intenso desde ayer y visión borrosa. Niega dolor de pecho.",
     "vitalSigns": {
       "respiratoryRate": 18, "spo2": 96, "systolicBp": 192, "diastolicBp": 112,
       "heartRate": 88, "temperature": 36.8, "consciousness": "A", "glucose": 210
     }
   }
   ```
   Respuesta: prioridad **ALTA** con la alerta `HTA_EMERGENCIA` (PA ≥180/110 + síntomas de órgano blanco).
4. **Ver la cola** – `GET /api/v1/triage/queue` → casos ordenados ALTA → MEDIA → BAJA.
5. **El especialista toma un caso** – `PATCH /api/v1/cases/1/assign` con `{ "specialistId": 2 }` → pasa a `EN_REVISION`.
   Si otro especialista intenta tomarlo recibe **409**.
6. **Subir un ECG o foto** – `POST /api/v1/cases/1/attachments` (form-data: `file`, `type`, `description`).
7. **Cerrar la atención** – `PATCH /api/v1/cases/1/status`
   ```json
   { "status": "ATENDIDO", "specialistNotes": "Se ajusta losartán a 100 mg/día. Control en 1 semana." }
   ```

---

## 4. Endpoints

Prefijo de todas las rutas: `/api/v1`

| Método | Ruta | Descripción |
|---|---|---|
| **Users** |||
| POST | `/users` | Crear promotor, especialista o admin |
| GET | `/users?role=ESPECIALISTA` | Listar (filtro opcional por rol) |
| GET | `/users/:id` | Detalle |
| PATCH | `/users/:id` | Editar / desactivar (`isActive: false`) |
| **Patients** |||
| POST | `/patients` | Crear paciente (documento único) |
| GET | `/patients?search=Burbano` | Listar / buscar por nombre o documento |
| GET | `/patients/:id` | Detalle (incluye edad calculada) |
| PATCH | `/patients/:id` | Editar datos y antecedentes |
| GET | `/patients/:id/cases` | Historial de casos |
| **Cases** |||
| POST | `/cases` | Crear caso + signos vitales → **triage automático** |
| GET | `/cases?status=&priority=&patientId=&createdById=&assignedToId=` | Listar con filtros |
| GET | `/cases/:id` | Detalle con signos, historial de triage y adjuntos |
| PATCH | `/cases/:id` | Editar textos (si cambian los síntomas se recalcula) |
| POST | `/cases/:id/vital-signs` | Nueva toma de signos (control) → recalcula |
| PATCH | `/cases/:id/assign` | Un especialista toma el caso → `EN_REVISION` |
| PATCH | `/cases/:id/release` | Lo suelta → vuelve a `PENDIENTE` |
| PATCH | `/cases/:id/status` | `ATENDIDO` / `DERIVADO` / `CERRADO` |
| **Triage** |||
| POST | `/triage/evaluate` | Con `caseId`: reevalúa y guarda. Sin `caseId`: solo simula |
| GET | `/triage/queue?priority=&onlyAvailable=true&specialistId=` | Cola priorizada |
| GET | `/triage/cases/:caseId/history` | Historial de evaluaciones |
| **Attachments** |||
| POST | `/cases/:caseId/attachments` | Subir JPG / PNG / WEBP / PDF (máx. 10 MB) |
| GET | `/cases/:caseId/attachments` | Listar adjuntos del caso |
| GET | `/attachments/:id/file` | Ver / descargar el archivo |
| DELETE | `/attachments/:id` | Eliminar |

**Formato de respuesta** (igual que en clase): `{ "message": "...", "data": ... }`

**Formato de error** (todos iguales, gracias al filtro global):
```json
{ "statusCode": 400, "error": "BAD_REQUEST", "message": ["vitalSigns.spo2 must not be greater than 100"], "path": "/api/v1/cases", "timestamp": "..." }
```

### Estados del caso

```
PENDIENTE ──assign──▶ EN_REVISION ──status──▶ ATENDIDO ─┐
    ▲                     │                   DERIVADO ─┼──▶ CERRADO
    └──────release────────┘                             │
PENDIENTE ─────────────────────────────────────────────┘
```
`ATENDIDO` y `DERIVADO` exigen `specialistNotes`.

### Orden de la cola

1. Prioridad: ALTA → MEDIA → BAJA
2. Mayor puntaje NEWS2
3. Más tiempo esperando (el más antiguo primero)

Cada caso trae `available` (nadie lo ha tomado), `isMine` (si se envía `specialistId`) y `waitingMinutes`.

---

## 5. Reglas clínicas

La prioridad final es **la más grave** entre NEWS2 y las reglas adicionales.

### NEWS2 (Royal College of Physicians, 2017)

| Parámetro | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|---|
| Frec. respiratoria | ≤8 | | 9–11 | 12–20 | | 21–24 | ≥25 |
| SpO₂ Escala 1 (%) | ≤91 | 92–93 | 94–95 | ≥96 | | | |
| SpO₂ Escala 2 (%)* | ≤83 | 84–85 | 86–87 | 88–92 / ≥93 aire | 93–94 O₂ | 95–96 O₂ | ≥97 O₂ |
| Oxígeno suplementario | | Sí | | No | | | |
| PA sistólica | ≤90 | 91–100 | 101–110 | 111–219 | | | ≥220 |
| Frec. cardiaca | ≤40 | | 41–50 | 51–90 | 91–110 | 111–130 | ≥131 |
| Conciencia (ACVPU) | | | | A | | | C, V, P o U |
| Temperatura (°C) | ≤35.0 | | 35.1–36.0 | 36.1–38.0 | 38.1–39.0 | ≥39.1 | |

\* Escala 2 solo si el paciente tiene `hasHypercapnicRespiratoryFailure = true` (EPOC con meta 88–92 % indicada por un médico).

| Puntaje | Prioridad |
|---|---|
| 0–4 | BAJA |
| Un parámetro con 3 puntos, o total 5–6 | MEDIA |
| ≥7 | ALTA |

NEWS2 no está validado en menores de 16 años ni en embarazo: en esos casos se agrega un aviso.

### Hipertensión (clasificación ESH 2023)

| Condición | Prioridad |
|---|---|
| PAS ≥180 o PAD ≥110 **con** síntomas de órgano blanco (dolor torácico, disnea, déficit neurológico, cefalea intensa, alteración visual, convulsión, confusión) o conciencia alterada → sospecha de **emergencia hipertensiva** | ALTA |
| PAS ≥180 o PAD ≥110 sin esos síntomas (urgencia hipertensiva) | MEDIA |
| PAS 160–179 o PAD 100–109 (grado 2) | BAJA + alerta |
| ≥140/90 en paciente **sin** diagnóstico de HTA | BAJA + alerta |

### Glucemia (ADA, Standards of Care in Diabetes)

| Condición | Prioridad |
|---|---|
| <70 mg/dL con conciencia alterada (hipoglucemia nivel 3) | ALTA |
| <54 mg/dL (nivel 2) | ALTA |
| 54–69 mg/dL (nivel 1) | MEDIA |
| >600 mg/dL (sospecha de estado hiperosmolar) | ALTA |
| ≥250 con conciencia alterada (crisis hiperglucémica) | ALTA |
| ≥250 (riesgo de cetoacidosis) | MEDIA |
| 180–249 | BAJA + alerta |
| Ayunas ≥126 sin diagnóstico de DM | BAJA + alerta |

### Síntomas en texto libre

Se buscan frases de alarma sin importar tildes ni mayúsculas (`"DOLOR TORÁCICO"` = `"dolor toracico"`).
Las frases negadas se ignoran: *"niega dolor de pecho"*, *"sin dificultad para respirar"*.
Cada síntoma detectado agrega una alerta **MEDIA**. Es solo una ayuda: el especialista siempre debe leer el texto completo.

---

## 6. Estructura del proyecto

```
src/
├── common/
│   ├── enums/          Role, Priority, CaseStatus, Consciousness, DocumentType, Sex, AttachmentType
│   ├── filters/        AllExceptionsFilter (formato único de errores)
│   └── interfaces/     TriageAlert, TriageResult
├── users/              Promotores y especialistas
├── patients/           Pacientes y antecedentes
├── cases/              Casos clínicos + signos vitales (VitalSigns)
├── triage/             NEWS2, reglas HTA/DM, cola priorizada, historial (TriageRecord)
├── attachments/        Subida de archivos con Multer
├── env.model.ts        Tipado de las variables de .env
├── app.module.ts
└── main.ts             Prefijo api/v1, CORS, ValidationPipe, filtro de errores, Swagger
```

### Modelo de datos

```
User (PROMOTOR) 1──* Case *──1 Patient
User (ESPECIALISTA) 1──* Case (assignedTo)
Case 1──* VitalSigns        (cada toma de signos)
Case 1──* TriageRecord      (cada evaluación, con su VitalSigns)
Case 1──* Attachment        (archivo en /uploads, datos en la BD)
```

---

## 7. Comandos útiles

| Comando | Para qué |
|---|---|
| `npm run start:dev` | Correr en desarrollo (se recarga solo) |
| `npm run build` y luego `npm run start:prod` | Compilar y correr la versión final |
| `npm run test` | Pruebas unitarias |
| `npm run format` | Formatear el código con Prettier |
| `docker compose ps` | Ver si Postgres está corriendo |
| `docker compose logs -f postgres` | Ver logs de la base de datos |

## 8. Problemas comunes

| Error | Solución |
|---|---|
| `ECONNREFUSED 127.0.0.1:5433` | Docker no está corriendo o falta `docker compose up -d` |
| `failed to connect to the docker API` | Abre Docker Desktop y espera a que inicie |
| `EADDRINUSE :::3000` | Ya hay otra API corriendo; ciérrala o cambia `PORT` en `.env` |
| `Configuration key "POSTGRES_HOST" does not exist` | Falta el archivo `.env` (Paso 2) |
| `npm error ... edgesOut` | Verifica que exista el archivo `.npmrc` |

## 9. Pendiente / posibles mejoras

- Autenticación con JWT y roles (`@Roles`, guards) para que cada usuario solo vea lo suyo.
- Migraciones de TypeORM en lugar de `synchronize: true` antes de usar datos reales.
- Validación de los umbrales clínicos por el médico asesor.
