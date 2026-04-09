@echo off
echo ========================================
echo INICIANDO API MOCK PARA ESTADISTICAS
echo ========================================
echo.
echo URL: http://127.0.0.1:5001
echo.
echo Endpoints disponibles:
echo   GET  /api/aulas
echo   POST /api/admin/estadistica/rango
echo   POST /api/admin/estadistica/mensual
echo   GET  /api/test
echo.
echo Presiona Ctrl+C para detener
echo ========================================
echo.

python test_estadisticas_api.py