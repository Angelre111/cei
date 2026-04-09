# Script para probar la funcionalidad de estadísticas del admin

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "PRUEBA DE ESTADÍSTICAS - ADMIN" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar archivos
Write-Host "1. Verificando archivos..." -ForegroundColor Yellow
$archivos = @(
    "admin.html",
    "test_estadisticas_api.py",
    "test_estadisticas.html"
)

foreach ($archivo in $archivos) {
    if (Test-Path $archivo) {
        Write-Host "   ✅ $archivo" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $archivo (NO ENCONTRADO)" -ForegroundColor Red
    }
}

Write-Host ""

# 2. Verificar estructura del admin.html
Write-Host "2. Verificando estructura de admin.html..." -ForegroundColor Yellow

# Buscar elementos clave
$adminContent = Get-Content "admin.html" -Raw

$checks = @{
    "Sección de estadísticas" = "section-estadisticas";
    "Modal de gráficos" = "modal-graficos-asistencia";
    "Función initEstadisticasAdmin" = "function initEstadisticasAdmin";
    "Botón Consultar Período" = "btn-generar-rango";
    "Botón Estadística MPPE" = "btn-generar-mensual";
    "Selector de modo" = "estadistica-mod";
    "Selector de aula" = "stat-aula-id";
}

foreach ($check in $checks.GetEnumerator()) {
    if ($adminContent -match $check.Value) {
        Write-Host "   ✅ $($check.Key)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($check.Key)" -ForegroundColor Red
    }
}

Write-Host ""

# 3. Instrucciones para probar
Write-Host "3. INSTRUCCIONES PARA PROBAR:" -ForegroundColor Cyan
Write-Host "   a) Iniciar API mock:" -ForegroundColor White
Write-Host "      python test_estadisticas_api.py" -ForegroundColor Gray
Write-Host ""
Write-Host "   b) Abrir página de prueba:" -ForegroundColor White
Write-Host "      Abrir test_estadisticas.html en el navegador" -ForegroundColor Gray
Write-Host "      URL: file:///C:/laragon/www/cei/test_estadisticas.html" -ForegroundColor Gray
Write-Host ""
Write-Host "   c) Probar admin.html completo:" -ForegroundColor White
Write-Host "      1. Iniciar servidor Flask principal (si existe)" -ForegroundColor Gray
Write-Host "      2. Abrir admin.html en navegador" -ForegroundColor Gray
Write-Host "      3. Iniciar sesión como administrador" -ForegroundColor Gray
Write-Host "      4. Ir a sección 'Estadísticas'" -ForegroundColor Gray
Write-Host ""
Write-Host "   d) Configurar API_BASE_URL para pruebas:" -ForegroundColor White
Write-Host "      En consola del navegador ejecutar:" -ForegroundColor Gray
Write-Host "      window.API_BASE_URL = 'http://127.0.0.1:5001'" -ForegroundColor Gray
Write-Host ""

# 4. Verificar dependencias Python
Write-Host "4. Verificando dependencias Python..." -ForegroundColor Yellow
try {
    $pythonCheck = python -c "import flask, flask_cors; print('OK')" 2>$null
    if ($pythonCheck -eq "OK") {
        Write-Host "   ✅ Flask y Flask-CORS instalados" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Flask no instalado. Instalar con:" -ForegroundColor Yellow
        Write-Host "      pip install flask flask-cors" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  Python no disponible o Flask no instalado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE ENDPOINTS NECESARIOS EN BACKEND:" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "GET    /api/aulas                      - Lista de aulas" -ForegroundColor White
Write-Host "POST   /api/admin/estadistica/rango    - Estadísticas por período" -ForegroundColor White
Write-Host "POST   /api/admin/estadistica/mensual  - Estadística mensual MPPE" -ForegroundColor White
Write-Host ""
Write-Host "Parámetros para /api/admin/estadistica/rango:" -ForegroundColor Gray
Write-Host '  { "modo": "escuela|aula", "aula_id": "id|null", "fecha_inicio": "...", "fecha_fin": "..." }' -ForegroundColor DarkGray
Write-Host ""
Write-Host "Parámetros para /api/admin/estadistica/mensual:" -ForegroundColor Gray
Write-Host '  { "modo": "escuela|aula", "aula_id": "id|null", "mes": 1-12, "anio": 2026, "dias_habiles": 20 }' -ForegroundColor DarkGray
Write-Host ""

# 5. Opción para abrir archivos
Write-Host "5. ¿Qué deseas hacer?" -ForegroundColor Cyan
Write-Host "   [1] Abrir página de prueba en navegador" -ForegroundColor White
Write-Host "   [2] Ver admin.html en editor" -ForegroundColor White
Write-Host "   [3] Salir" -ForegroundColor White
Write-Host ""

$opcion = Read-Host "Selecciona una opción (1-3)"

switch ($opcion) {
    "1" {
        Start-Process "test_estadisticas.html"
        Write-Host "✅ Página de prueba abierta" -ForegroundColor Green
    }
    "2" {
        Start-Process "admin.html"
        Write-Host "✅ admin.html abierto" -ForegroundColor Green
    }
    "3" {
        Write-Host "👋 ¡Hasta luego!" -ForegroundColor Cyan
    }
    default {
        Write-Host "❌ Opción no válida" -ForegroundColor Red
    }
}