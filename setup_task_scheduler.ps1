# ===========================================================
# CONFIGURAR TASK SCHEDULER — CEI La Paragua (DRP)
# ===========================================================
# Ejecutar como ADMINISTRADOR:
# PowerShell: Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File C:\laragon\www\cei\setup_task_scheduler.ps1"
# ===========================================================

$ScriptPath = "C:\laragon\www\cei\backup_db.ps1"
$TaskName   = "Respaldo CEI La Paragua"

# ─── Verificar que el script de respaldo existe ─────────────
if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: No se encontró el script en: $ScriptPath" -ForegroundColor Red
    Write-Host "Asegúrate de que el proyecto esté en C:\laragon\www\cei\" -ForegroundColor Yellow
    Read-Host "Presiona Enter para salir"
    exit 1
}

# ─── Eliminar tarea existente si ya había una ───────────────
$existente = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existente) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tarea anterior '$TaskName' eliminada." -ForegroundColor Yellow
}

# ─── Configurar la ACCIÓN ──────────────────────────────────
# La acción ejecuta PowerShell de forma oculta con el script de respaldo
$Accion = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# ─── DISPARADOR 1: Diariamente a las 7:00 PM ──────────────
$Trigger7PM = New-ScheduledTaskTrigger `
    -Daily `
    -At "19:00"

# ─── DISPARADOR 2: Al inicio del sistema (startup) ─────────
# Usa el parámetro -Startup para que el script verifique
# si el respaldo de hoy ya fue ejecutado (lógica de 20h)
$AccionStartup = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" -Startup"

$TriggerStartup = New-ScheduledTaskTrigger -AtStartup

# ─── Configuración general ─────────────────────────────────
$Configuracion = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -StartWhenAvailable `             # Ejecutar aunque la hora ya pasó (vital para el trigger de 7PM)
    -DontStopIfGoingOnBatteries `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew      # No lanzar si ya hay una instancia corriendo

# ─── Registrar TAREA 1: Respaldo a las 7 PM ────────────────
$Tarea1 = Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Accion `
    -Trigger $Trigger7PM `
    -Settings $Configuracion `
    -Description "Respaldo diario de la BD de CEI La Paragua a las 7 PM. Encriptado con AES-256." `
    -RunLevel Highest `
    -Force

# ─── Registrar TAREA 2: Respaldo al inicio del sistema ─────
$NombreStartup = "$TaskName (Startup)"
$existenteStartup = Get-ScheduledTask -TaskName $NombreStartup -ErrorAction SilentlyContinue
if ($existenteStartup) {
    Unregister-ScheduledTask -TaskName $NombreStartup -Confirm:$false
}

$Tarea2 = Register-ScheduledTask `
    -TaskName $NombreStartup `
    -Action $AccionStartup `
    -Trigger $TriggerStartup `
    -Settings $Configuracion `
    -Description "Respaldo de BD al encender la PC (ejecuta solo si el último respaldo fue hace más de 20h)." `
    -RunLevel Highest `
    -Force

# ─── Resultado ─────────────────────────────────────────────
Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "  ✅ TAREAS PROGRAMADAS CONFIGURADAS EXITOSAMENTE" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  TAREA 1: '$TaskName'" -ForegroundColor Cyan
Write-Host "    → Ejecuta todos los días a las 7:00 PM" -ForegroundColor White
Write-Host "    → Si la PC estaba apagada, corre cuando vuelva a encenderse" -ForegroundColor White
Write-Host ""
Write-Host "  TAREA 2: '$NombreStartup'" -ForegroundColor Cyan
Write-Host "    → Ejecuta al encender la PC" -ForegroundColor White
Write-Host "    → Solo actúa si el último respaldo fue hace más de 20 horas" -ForegroundColor White
Write-Host ""
Write-Host "  Respaldos guardados en: C:\Respaldos_CEI\" -ForegroundColor Yellow
Write-Host "  Log: C:\Respaldos_CEI\backup_log.txt" -ForegroundColor Yellow
Write-Host ""
Write-Host "  ⚠️  IMPORTANTE: Edita el .env y define BACKUP_PASSWORD antes" -ForegroundColor Red
Write-Host "     del primer respaldo automático." -ForegroundColor Red
Write-Host ""
Read-Host "Presiona Enter para cerrar"
