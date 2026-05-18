# ===========================================================
# SCRIPT DE RESPALDO LOCAL - CEI La Paragua
# ===========================================================
# Uso normal (Task Scheduler - 7 PM):
#   powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\laragon\www\cei\backup_db.ps1"
#
# Uso manual:
#   powershell.exe -ExecutionPolicy Bypass -File "C:\laragon\www\cei\backup_db.ps1" -Manual
#
# Uso al inicio del sistema (startup trigger):
#   powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\laragon\www\cei\backup_db.ps1" -Startup
# ===========================================================

param(
    [switch]$Manual,
    [switch]$Startup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- 1. LEER VARIABLES DE ENTORNO DESDE .env ---
$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name  = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$DATABASE_URL    = [System.Environment]::GetEnvironmentVariable("DATABASE_URL",    "Process")
$BACKUP_PASSWORD = [System.Environment]::GetEnvironmentVariable("BACKUP_PASSWORD", "Process")
$BACKUP_DIR      = [System.Environment]::GetEnvironmentVariable("BACKUP_DIR",      "Process")
$PGDUMP_PATH     = [System.Environment]::GetEnvironmentVariable("PGDUMP_PATH",     "Process")
$SEVEN_ZIP_PATH  = [System.Environment]::GetEnvironmentVariable("SEVEN_ZIP_PATH",  "Process")

# Valores por defecto
if (-not $BACKUP_DIR)     { $BACKUP_DIR     = "C:\Respaldos_CEI" }
if (-not $PGDUMP_PATH)    { $PGDUMP_PATH    = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" }
if (-not $SEVEN_ZIP_PATH) { $SEVEN_ZIP_PATH = "C:\Program Files\7-Zip\7z.exe" }

# --- 2. FUNCION LOG ---
$logFile = Join-Path $BACKUP_DIR "backup_log.txt"

function Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $msg"
    Write-Host $line
    if (-not (Test-Path $BACKUP_DIR)) { New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null }
    Add-Content -Path $logFile -Value $line
}

Log "=== INICIO DEL PROCESO DE RESPALDO CEI ==="
if ($Manual)  { Log "Modo: MANUAL" }
if ($Startup) { Log "Modo: STARTUP (verificando si es necesario)" }

# --- 3. LOGICA DE STARTUP ---
if ($Startup -and -not $Manual) {
    $ultimoArchivo = @(Get-ChildItem -Path $BACKUP_DIR -Filter "cei_backup_*.7z" -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending | Select-Object -First 1)

    if ($ultimoArchivo.Count -gt 0) {
        $horasDiff = (Get-Date) - $ultimoArchivo[0].LastWriteTime
        if ($horasDiff.TotalHours -lt 20) {
            Log "Respaldo reciente encontrado: $($ultimoArchivo[0].Name) (hace $([math]::Round($horasDiff.TotalHours, 1))h). Omitiendo."
            Log "=== FIN (sin accion necesaria) ==="
            exit 0
        }
    }
    Log "No hay respaldo reciente. Procediendo con el respaldo de arranque."
}

# --- 4. VERIFICAR HERRAMIENTAS ---
if (-not (Test-Path $PGDUMP_PATH)) {
    Log "ERROR: pg_dump no encontrado en: $PGDUMP_PATH"
    Log "Instala PostgreSQL o ajusta PGDUMP_PATH en el .env"
    exit 1
}

if (-not (Test-Path $SEVEN_ZIP_PATH)) {
    Log "ERROR: 7-Zip no encontrado en: $SEVEN_ZIP_PATH"
    Log "Instala 7-Zip desde https://www.7-zip.org/ o ajusta SEVEN_ZIP_PATH en el .env"
    exit 1
}

if (-not $DATABASE_URL) {
    Log "ERROR: DATABASE_URL no esta definida en el .env"
    exit 1
}

if (-not $BACKUP_PASSWORD -or $BACKUP_PASSWORD -eq "TU_CONTRASEÑA_MAESTRA_AQUI") {
    Log "ERROR: BACKUP_PASSWORD no esta configurada. Edita el archivo .env y define una contrasena maestra."
    exit 1
}

# --- 5. CREAR CARPETAS DE DESTINO ---
$anualesDir = Join-Path $BACKUP_DIR "Cierres_Anuales"
foreach ($dir in @($BACKUP_DIR, $anualesDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Log "Carpeta creada: $dir"
    }
}

# --- 6. GENERAR NOMBRE DE ARCHIVO ---
$fechaStr  = Get-Date -Format "yyyy-MM-dd"
$horaStr   = Get-Date -Format "HH-mm"
$tipoLabel = if ($Manual) { "manual" } else { "auto" }
$sqlFile   = Join-Path $env:TEMP "cei_backup_temp_$($fechaStr)_$($horaStr).sql"
$archName  = "cei_backup_${fechaStr}_${tipoLabel}.7z"
$archFile  = Join-Path $BACKUP_DIR $archName

# Si ya existe un archivo del mismo nombre, eliminarlo antes de crear el nuevo
if (Test-Path $archFile) {
    Log "Eliminando respaldo previo del mismo nombre: $archName"
    Remove-Item $archFile -Force
}

# --- 7. EJECUTAR pg_dump ---
Log "Iniciando pg_dump..."
try {
    $env:PGPASSWORD = ""
    $pgDumpArgs = @("--dbname=$DATABASE_URL", "--format=plain", "--no-owner", "--no-acl", "--encoding=UTF8", "--inserts", "--on-conflict-do-nothing", "--file=$sqlFile")
    $pgDumpOutput = & $PGDUMP_PATH $pgDumpArgs 2>&1

    if ($LASTEXITCODE -ne 0) {
        Log "ERROR: pg_dump fallo (codigo $LASTEXITCODE): $pgDumpOutput"
        exit 1
    }

    $sqlSizeMB = [math]::Round((Get-Item $sqlFile).Length / 1MB, 2)
    Log "pg_dump completado. Tamano SQL: ${sqlSizeMB} MB"
}
catch {
    Log "EXCEPCION en pg_dump: $_"
    exit 1
}

# --- 8. COMPRIMIR Y ENCRIPTAR CON 7-ZIP ---
Log "Encriptando con 7-Zip AES-256..."
try {
    $7zArgs = @("a", "-t7z", "-p$BACKUP_PASSWORD", "-mhe=on", "-mx=5", "$archFile", "$sqlFile")
    $7zOutput = & $SEVEN_ZIP_PATH $7zArgs 2>&1

    if ($LASTEXITCODE -ne 0) {
        Log "ERROR: 7-Zip fallo (codigo $LASTEXITCODE): $7zOutput"
        if (Test-Path $sqlFile) { Remove-Item $sqlFile -Force }
        exit 1
    }

    $archSizeMB = [math]::Round((Get-Item $archFile).Length / 1MB, 2)
    Log "Encriptacion completada. Archivo: $archName (${archSizeMB} MB)"
}
catch {
    Log "EXCEPCION en 7-Zip: $_"
    if (Test-Path $sqlFile) { Remove-Item $sqlFile -Force }
    exit 1
}

# --- 9. BORRAR SQL TEMPORAL ---
if (Test-Path $sqlFile) {
    Remove-Item $sqlFile -Force
    Log "Archivo SQL temporal eliminado."
}

# --- 10. POLITICA DE RETENCION ---
Log "Aplicando politica de retencion..."

$todosArchivos = @(Get-ChildItem -Path $BACKUP_DIR -Filter "cei_backup_*.7z" |
    Sort-Object LastWriteTime -Descending)

$hoy        = Get-Date
$diaJulio31 = ($hoy.Month -eq 7 -and $hoy.Day -eq 31)

# Cierre anual: si hoy es 31 de julio
if ($diaJulio31) {
    $archivoAnual = Join-Path $BACKUP_DIR "cei_backup_${fechaStr}_auto.7z"
    if (Test-Path $archivoAnual) {
        $destAnual = Join-Path $anualesDir "cei_anual_${fechaStr}.7z"
        Move-Item $archivoAnual $destAnual -Force
        Log "CIERRE ANUAL: $archivoAnual movido a $destAnual"
    }
    $todosArchivos = @(Get-ChildItem -Path $BACKUP_DIR -Filter "cei_backup_*.7z" |
        Sort-Object LastWriteTime -Descending)
}

$aConservar = [System.Collections.Generic.HashSet[string]]::new()

# Diarios: conservar los ultimos 7
$todosArchivos | Select-Object -First 7 | ForEach-Object { $aConservar.Add($_.FullName) | Out-Null }

# Semanales: 1 por semana del ultimo mes
$semanasCubiertas = @{}
foreach ($archivo in $todosArchivos) {
    $diasAtras = ($hoy - $archivo.LastWriteTime).Days
    if ($diasAtras -le 31) {
        $numSemana = [math]::Floor($diasAtras / 7)
        if (-not $semanasCubiertas.ContainsKey($numSemana)) {
            $semanasCubiertas[$numSemana] = $archivo.FullName
            $aConservar.Add($archivo.FullName) | Out-Null
        }
    }
}

# Mensuales: 1 por mes del ultimo ano
$mesesCubiertos = @{}
foreach ($archivo in $todosArchivos) {
    $clavesMes = "$($archivo.LastWriteTime.Year)-$($archivo.LastWriteTime.Month)"
    if (-not $mesesCubiertos.ContainsKey($clavesMes)) {
        $mesesCubiertos[$clavesMes] = $archivo.FullName
        $aConservar.Add($archivo.FullName) | Out-Null
    }
    if (($hoy - $archivo.LastWriteTime).Days -gt 366) { break }
}

# Eliminar los que no estan en la lista de conservacion
$eliminados = 0
foreach ($archivo in $todosArchivos) {
    if (-not $aConservar.Contains($archivo.FullName)) {
        Remove-Item $archivo.FullName -Force
        Log "Retencion: eliminado $($archivo.Name)"
        $eliminados++
    }
}

$conservados = $todosArchivos.Count - $eliminados
Log "Retencion completada: $conservados archivos conservados, $eliminados eliminados."

# --- 11. RESUMEN FINAL ---
Log "=== RESPALDO COMPLETADO EXITOSAMENTE ==="
Log "Archivo: $archName"
Log "Ubicacion: $BACKUP_DIR"
Log "Hora: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log "=========================================="

exit 0
