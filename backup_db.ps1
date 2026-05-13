# ===========================================================
# SCRIPT DE RESPALDO LOCAL — CEI La Paragua
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
    [switch]$Manual,    # Forzar ejecución manual (sin verificar hora)
    [switch]$Startup    # Modo arranque: solo ejecuta si el último respaldo fue hace >20h
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── 1. LEER VARIABLES DE ENTORNO DESDE .env ───────────────
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

# Valores por defecto si el .env no los tiene
if (-not $BACKUP_DIR)     { $BACKUP_DIR      = "C:\Respaldos_CEI" }
if (-not $PGDUMP_PATH)    { $PGDUMP_PATH     = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" }
if (-not $SEVEN_ZIP_PATH) { $SEVEN_ZIP_PATH  = "C:\Program Files\7-Zip\7z.exe" }

# ─── 2. VALIDACIONES ───────────────────────────────────────
$logFile = Join-Path $BACKUP_DIR "backup_log.txt"

function Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $msg"
    Write-Host $line
    # Crear carpeta de log si no existe
    if (-not (Test-Path $BACKUP_DIR)) { New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null }
    Add-Content -Path $logFile -Value $line
}

Log "=== INICIO DEL PROCESO DE RESPALDO CEI ==="
if ($Manual)  { Log "Modo: MANUAL" }
if ($Startup) { Log "Modo: STARTUP (verificando si es necesario)" }

# ─── 3. LÓGICA DE STARTUP: No duplicar si ya corrió hoy ────
if ($Startup -and -not $Manual) {
    $ultimoArchivo = Get-ChildItem -Path $BACKUP_DIR -Filter "cei_backup_*.7z" -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($ultimoArchivo) {
        $horasDiff = (Get-Date) - $ultimoArchivo.LastWriteTime
        if ($horasDiff.TotalHours -lt 20) {
            Log "Respaldo reciente encontrado: $($ultimoArchivo.Name) (hace $([math]::Round($horasDiff.TotalHours, 1))h). Omitiendo ejecución duplicada."
            Log "=== FIN (sin acción necesaria) ==="
            exit 0
        }
    }
    Log "No hay respaldo reciente. Procediendo con el respaldo de arranque."
}

# ─── 4. VERIFICAR HERRAMIENTAS ──────────────────────────────
if (-not (Test-Path $PGDUMP_PATH)) {
    Log "ERROR: pg_dump no encontrado en: $PGDUMP_PATH"
    Log "Instala PostgreSQL 17 o ajusta PGDUMP_PATH en el .env"
    exit 1
}

if (-not (Test-Path $SEVEN_ZIP_PATH)) {
    Log "ERROR: 7-Zip no encontrado en: $SEVEN_ZIP_PATH"
    Log "Instala 7-Zip desde https://www.7-zip.org/ o ajusta SEVEN_ZIP_PATH en el .env"
    exit 1
}

if (-not $DATABASE_URL) {
    Log "ERROR: DATABASE_URL no está definida en el .env"
    exit 1
}

if (-not $BACKUP_PASSWORD -or $BACKUP_PASSWORD -eq "TU_CONTRASEÑA_MAESTRA_AQUI") {
    Log "ERROR: BACKUP_PASSWORD no está configurada. Edita el archivo .env y define una contraseña maestra."
    exit 1
}

# ─── 5. CREAR CARPETAS DE DESTINO ──────────────────────────
$anualesDir = Join-Path $BACKUP_DIR "Cierres_Anuales"
foreach ($dir in @($BACKUP_DIR, $anualesDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Log "Carpeta creada: $dir"
    }
}

# ─── 6. GENERAR NOMBRE DE ARCHIVO ──────────────────────────
$fechaStr  = Get-Date -Format "yyyy-MM-dd"
$horaStr   = Get-Date -Format "HH-mm"
$tipoLabel = if ($Manual) { "manual" } else { "auto" }
$sqlFile   = Join-Path $env:TEMP "cei_backup_temp_$($fechaStr)_$($horaStr).sql"
$archName  = "cei_backup_${fechaStr}_${tipoLabel}.7z"
$archFile  = Join-Path $BACKUP_DIR $archName

# Si ya existe un respaldo del mismo día (auto), sobreescribir con el nuevo
if ((Test-Path $archFile) -and -not $Manual) {
    Log "Ya existe respaldo de hoy ($archName). Será sobreescrito."
    Remove-Item $archFile -Force
}

# ─── 7. EJECUTAR pg_dump ───────────────────────────────────
Log "Iniciando pg_dump..."
try {
    $env:PGPASSWORD = ""  # Limpiamos por si acaso; la clave va en la URL
    $pgDumpOutput = & $PGDUMP_PATH `
        --dbname="$DATABASE_URL" `
        --format=plain `
        --no-owner `
        --no-acl `
        --encoding=UTF8 `
        --file="$sqlFile" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Log "ERROR: pg_dump falló (código $LASTEXITCODE): $pgDumpOutput"
        exit 1
    }

    $sqlSizeMB = [math]::Round((Get-Item $sqlFile).Length / 1MB, 2)
    Log "pg_dump completado. Tamaño SQL: ${sqlSizeMB} MB"
} catch {
    Log "EXCEPCIÓN en pg_dump: $_"
    exit 1
}

# ─── 8. COMPRIMIR Y ENCRIPTAR CON 7-ZIP ────────────────────
Log "Encriptando con 7-Zip AES-256..."
try {
    $7zOutput = & $SEVEN_ZIP_PATH a `
        -t7z `
        "-p$BACKUP_PASSWORD" `
        -mhe=on `
        -mx=5 `
        "$archFile" `
        "$sqlFile" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Log "ERROR: 7-Zip falló (código $LASTEXITCODE): $7zOutput"
        # Limpiar SQL temporal aunque falle
        if (Test-Path $sqlFile) { Remove-Item $sqlFile -Force }
        exit 1
    }

    $archSizeMB = [math]::Round((Get-Item $archFile).Length / 1MB, 2)
    Log "Encriptación completada. Archivo: $archName (${archSizeMB} MB)"
} catch {
    Log "EXCEPCIÓN en 7-Zip: $_"
    if (Test-Path $sqlFile) { Remove-Item $sqlFile -Force }
    exit 1
}

# ─── 9. BORRAR SQL TEMPORAL ────────────────────────────────
if (Test-Path $sqlFile) {
    Remove-Item $sqlFile -Force
    Log "Archivo SQL temporal eliminado."
}

# ─── 10. POLÍTICA DE RETENCIÓN ─────────────────────────────
Log "Aplicando política de retención..."

# Obtener todos los archivos .7z ordenados por fecha (más nuevo primero)
$todosArchivos = Get-ChildItem -Path $BACKUP_DIR -Filter "cei_backup_*.7z" |
    Sort-Object LastWriteTime -Descending

$hoy        = Get-Date
$diaJulio31 = ($hoy.Month -eq 7 -and $hoy.Day -eq 31)

# ── Cierre anual: si hoy es 31 de julio, mover el .7z de hoy a Cierres_Anuales
if ($diaJulio31) {
    $archivoAnual = Join-Path $BACKUP_DIR "cei_backup_${fechaStr}_auto.7z"
    if (Test-Path $archivoAnual) {
        $destAnual = Join-Path $anualesDir "cei_anual_${fechaStr}.7z"
        Move-Item $archivoAnual $destAnual -Force
        Log "CIERRE ANUAL: $archivoAnual movido a $destAnual (conservación permanente 10 años)"
    }
    # Refrescar lista tras el movimiento
    $todosArchivos = Get-ChildItem -Path $BACKUP_DIR -Filter "cei_backup_*.7z" |
        Sort-Object LastWriteTime -Descending
}

# ── Clasificar los archivos por período
$aConservar = [System.Collections.Generic.HashSet[string]]::new()

# Diarios: conservar los últimos 7 (independientemente del día de semana)
$todosArchivos | Select-Object -First 7 | ForEach-Object { $aConservar.Add($_.FullName) | Out-Null }

# Semanales: 1 por semana del último mes (4 semanas)
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

# Mensuales: 1 por mes del último año (12 meses)
$mesesCubiertos = @{}
foreach ($archivo in $todosArchivos) {
    $clavesMes = "$($archivo.LastWriteTime.Year)-$($archivo.LastWriteTime.Month)"
    if (-not $mesesCubiertos.ContainsKey($clavesMes)) {
        $mesesCubiertos[$clavesMes] = $archivo.FullName
        $aConservar.Add($archivo.FullName) | Out-Null
    }
    # Solo miramos el último año
    if (($hoy - $archivo.LastWriteTime).Days -gt 366) { break }
}

# ── Eliminar los que no están en la lista de conservación
$eliminados = 0
foreach ($archivo in $todosArchivos) {
    if (-not $aConservar.Contains($archivo.FullName)) {
        Remove-Item $archivo.FullName -Force
        Log "Retención: eliminado $($archivo.Name)"
        $eliminados++
    }
}

$conservados = $todosArchivos.Count - $eliminados
Log "Retención completada: $conservados archivos conservados, $eliminados eliminados."

# ─── 11. RESUMEN FINAL ─────────────────────────────────────
Log "=== RESPALDO COMPLETADO EXITOSAMENTE ==="
Log "Archivo: $archName"
Log "Ubicación: $BACKUP_DIR"
Log "Hora: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log "=========================================="

exit 0
