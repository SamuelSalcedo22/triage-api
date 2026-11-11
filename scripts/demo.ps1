# ============================================================================
#  DEMO EN VIVO - recorre el esqueleto de punta a punta desde PowerShell
#
#  Requisito: la API corriendo (npm run levantar) en otra ventana.
#  Uso:       npm run demo
#             .\scripts\demo.ps1 -Pausa      (espera ENTER entre pasos)
#
#  Nota: el script no usa tildes a proposito, para que funcione igual en
#  Windows PowerShell 5.1 y en PowerShell 7.
# ============================================================================
param(
  [string]$Base = "http://localhost:3000/api/v1",
  [switch]$Pausa
)

$ErrorActionPreference = "Stop"
$sufijo = Get-Date -Format "HHmmss"   # para poder repetir la demo sin datos duplicados

function Paso($numero, $titulo) {
  if ($Pausa -and $numero -gt 0) { Read-Host "`n(ENTER para continuar)" | Out-Null }
  Write-Host "`n=== $numero. $titulo ===" -ForegroundColor Cyan
}

# Llama a la API. Devuelve un objeto con Status y Body, tanto si sale bien como si falla.
function Llamar($metodo, $ruta, $cuerpo) {
  $parametros = @{ Method = $metodo; Uri = "$Base$ruta" }
  if ($cuerpo) {
    $json = $cuerpo | ConvertTo-Json -Depth 6
    $parametros.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    $parametros.ContentType = "application/json; charset=utf-8"
  }
  try {
    $respuesta = Invoke-RestMethod @parametros
    return [pscustomobject]@{ Status = 200; Body = $respuesta }
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    $detalle = $null
    if ($_.ErrorDetails.Message) { $detalle = $_.ErrorDetails.Message | ConvertFrom-Json }
    return [pscustomobject]@{ Status = $status; Body = $detalle }
  }
}

function Mostrar-Error($r) {
  Write-Host ("  -> HTTP {0}: {1}" -f $r.Status, ($r.Body.message -join " | ")) -ForegroundColor Yellow
}

$signosNormales = @{ respiratoryRate = 16; spo2 = 98; systolicBp = 120; diastolicBp = 80; heartRate = 72; temperature = 36.6; consciousness = "A" }

# ----------------------------------------------------------------------------
Paso 0 "El sistema esta arriba y conectado a la base de datos"
$salud = Llamar GET "/health"
if ($salud.Status -ne 200) {
  Write-Host "La API no responde en $Base. Ejecuta primero: npm run levantar" -ForegroundColor Red
  exit 1
}
$salud.Body.data | Format-List

# ----------------------------------------------------------------------------
Paso 1 "Tipos de usuario: un promotor en campo y dos especialistas"
$promotor = (Llamar POST "/users" @{ fullName = "Pedro Promotor"; email = "pedro$sufijo@demo.com"; role = "PROMOTOR" }).Body.data
$laura = (Llamar POST "/users" @{ fullName = "Dra. Laura Martinez"; email = "laura$sufijo@demo.com"; role = "ESPECIALISTA"; specialty = "Medicina interna" }).Body.data
$andres = (Llamar POST "/users" @{ fullName = "Dr. Andres Rosero"; email = "andres$sufijo@demo.com"; role = "ESPECIALISTA"; specialty = "Medicina familiar" }).Body.data
$promotor, $laura, $andres | Format-Table id, fullName, role, specialty

# ----------------------------------------------------------------------------
Paso 2 "El promotor registra una paciente hipertensa y diabetica"
$paciente = (Llamar POST "/patients" @{
    documentType = "CC"; documentNumber = "10$sufijo"; firstName = "Maria Jose"; lastName = "Burbano Rosero"
    birthDate = "1958-03-21"; sex = "F"; locality = "Catambuco"; hasHypertension = $true; hasDiabetes = $true
  }).Body.data
$paciente | Format-List id, firstName, lastName, age, municipality, hasHypertension, hasDiabetes

# ----------------------------------------------------------------------------
Paso 3 "Caso leve: signos normales (se registra PRIMERO)"
$leve = (Llamar POST "/cases" @{
    patientId = $paciente.id; createdById = $promotor.id
    reasonForConsultation = "Control mensual"; symptoms = "Sin sintomas, control rutinario"
    vitalSigns = $signosNormales
  }).Body
Write-Host "  $($leve.message)" -ForegroundColor Green

# ----------------------------------------------------------------------------
Paso 4 "Caso grave: PA 192/112 + cefalea intensa (se registra DESPUES)"
$graves = $signosNormales.Clone(); $graves.systolicBp = 192; $graves.diastolicBp = 112; $graves.glucose = 210
$grave = (Llamar POST "/cases" @{
    patientId = $paciente.id; createdById = $promotor.id
    reasonForConsultation = "Dolor de cabeza"
    symptoms = "Dolor de cabeza intenso desde ayer y vision borrosa. Niega dolor de pecho."
    vitalSigns = $graves
  }).Body
Write-Host "  $($grave.message)" -ForegroundColor Red
Write-Host "  NEWS2 = $($grave.data.triage.news2Score) (solo NEWS2 daria $($grave.data.triage.news2Priority)); la regla de hipertension lo sube a $($grave.data.triage.priority)"
$grave.data.triage.alerts | Format-Table level, code, message -Wrap

# ----------------------------------------------------------------------------
Paso 5 "Cola del especialista: el caso grave queda primero aunque llego despues"
(Llamar GET "/triage/queue").Body.data |
  Where-Object { $_.id -in $leve.data.case.id, $grave.data.case.id } |
  Format-Table position, id, priority, news2Score, status, available, @{ n = "motivo"; e = { $_.reasonForConsultation } }

# ----------------------------------------------------------------------------
Paso 6 "La entrada se valida: SpO2 de 150 % es imposible"
$malos = $signosNormales.Clone(); $malos.spo2 = 150
Mostrar-Error (Llamar POST "/cases" @{ patientId = $paciente.id; createdById = $promotor.id; reasonForConsultation = "x"; symptoms = "x"; vitalSigns = $malos })

# ----------------------------------------------------------------------------
Paso 7 "Reglas por rol: la Dra. Laura toma el caso; el Dr. Andres ya no puede"
$idGrave = $grave.data.case.id
$tomado = (Llamar PATCH "/cases/$idGrave/assign" @{ specialistId = $laura.id }).Body
Write-Host "  $($tomado.message) -> estado $($tomado.data.status)" -ForegroundColor Green
Mostrar-Error (Llamar PATCH "/cases/$idGrave/assign" @{ specialistId = $andres.id })
Write-Host "  Un promotor tampoco puede tomar casos:"
Mostrar-Error (Llamar PATCH "/cases/$($leve.data.case.id)/assign" @{ specialistId = $promotor.id })

# ----------------------------------------------------------------------------
Paso 8 "Cierre: no se puede marcar ATENDIDO sin notas; con notas si"
Mostrar-Error (Llamar PATCH "/cases/$idGrave/status" @{ status = "ATENDIDO" })
$cerrado = (Llamar PATCH "/cases/$idGrave/status" @{ status = "ATENDIDO"; specialistNotes = "Se remite a urgencias por sospecha de emergencia hipertensiva." }).Body
Write-Host "  $($cerrado.message)" -ForegroundColor Green

# ----------------------------------------------------------------------------
Paso 9 "Reevaluacion: al caso leve le llega una glucometria de 45 mg/dL"
$hipo = $signosNormales.Clone(); $hipo.glucose = 45
$reeval = (Llamar POST "/triage/evaluate" @{ caseId = $leve.data.case.id; vitalSigns = $hipo }).Body
Write-Host "  $($reeval.message): ahora es $($reeval.data.priority)" -ForegroundColor Red
(Llamar GET "/triage/cases/$($leve.data.case.id)/history").Body.data | Format-Table evaluatedAt, priority, news2Score, recommendation -Wrap

Write-Host "`nDemo terminada. Swagger: http://localhost:3000/api/docs" -ForegroundColor Cyan
