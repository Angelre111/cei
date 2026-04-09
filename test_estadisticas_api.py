#!/usr/bin/env python3
"""
API Mock para pruebas de estadísticas del admin
Ejecutar: python test_estadisticas_api.py
Luego probar en: http://127.0.0.1:5001
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import json
from datetime import datetime, timedelta
import random

app = Flask(__name__)
CORS(app)  # Permitir CORS para pruebas locales

# Datos mock de aulas
AULAS_MOCK = [
    {"id": 1, "nombre": "Maternal", "docente_nombre": "Prof. María González"},
    {"id": 2, "nombre": "Pre-kinder A", "docente_nombre": "Prof. Ana Rodríguez"},
    {"id": 3, "nombre": "Pre-kinder B", "docente_nombre": "Prof. Carmen López"},
    {"id": 4, "nombre": "Kinder", "docente_nombre": "Prof. Laura Pérez"},
]

@app.route('/api/aulas', methods=['GET'])
def get_aulas():
    """Endpoint para obtener lista de aulas"""
    return jsonify({
        "success": True,
        "aulas": AULAS_MOCK
    })

@app.route('/api/admin/estadistica/rango', methods=['POST'])
def estadistica_rango():
    """Endpoint para estadísticas por rango de fechas"""
    data = request.json
    modo = data.get('modo', 'escuela')
    aula_id = data.get('aula_id')
    fecha_inicio = data.get('fecha_inicio')
    fecha_fin = data.get('fecha_fin')
    
    print(f"[DEBUG] Estadística rango - Modo: {modo}, Aula: {aula_id}, Fechas: {fecha_inicio} a {fecha_fin}")
    
    # Generar datos mock
    total_estudiantes = 150 if modo == 'escuela' else random.randint(15, 25)
    total_presentes = random.randint(int(total_estudiantes * 0.7), int(total_estudiantes * 0.9))
    total_ausentes = total_estudiantes - total_presentes
    
    # Generar tendencia de 15 días
    tendencia = []
    fecha_actual = datetime.strptime(fecha_inicio, '%Y-%m-%d')
    fecha_final = datetime.strptime(fecha_fin, '%Y-%m-%d')
    
    while fecha_actual <= fecha_final and len(tendencia) < 15:
        presentes_dia = random.randint(int(total_estudiantes * 0.65), int(total_estudiantes * 0.95))
        tendencia.append({
            "fecha": fecha_actual.strftime('%Y-%m-%d'),
            "fecha_corta": fecha_actual.strftime('%d/%m'),
            "presentes": presentes_dia,
            "ausentes": total_estudiantes - presentes_dia
        })
        fecha_actual += timedelta(days=1)
    
    return jsonify({
        "success": True,
        "modo": modo,
        "aula_id": aula_id,
        "resumen": {
            "total_estudiantes": total_estudiantes,
            "total_presentes": total_presentes,
            "total_ausentes": total_ausentes,
            "total_registros": total_presentes + total_ausentes,
            "porcentaje_asistencia": round((total_presentes / total_estudiantes) * 100, 1) if total_estudiantes > 0 else 0
        },
        "tendencia": tendencia
    })

@app.route('/api/admin/estadistica/mensual', methods=['POST'])
def estadistica_mensual():
    """Endpoint para estadística mensual MPPE"""
    data = request.json
    modo = data.get('modo', 'escuela')
    aula_id = data.get('aula_id')
    mes = data.get('mes', datetime.now().month)
    anio = data.get('anio', datetime.now().year)
    dias_habiles = data.get('dias_habiles', 20)
    
    print(f"[DEBUG] Estadística mensual - Modo: {modo}, Aula: {aula_id}, Mes: {mes}, Días hábiles: {dias_habiles}")
    
    # Generar archivo DOCX mock (en realidad devolvemos un archivo de texto simple)
    from io import BytesIO
    
    contenido = f"""ESTADÍSTICA MPPE - {'ESCUELA COMPLETA' if modo == 'escuela' else 'AULA ESPECÍFICA'}
Mes: {mes}/{anio}
Días hábiles: {dias_habiles}
Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}

Este es un archivo mock para pruebas.
En producción, aquí iría el documento DOCX con el formato oficial MPPE.
"""
    
    from flask import make_response
    response = make_response(contenido)
    response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    response.headers['Content-Disposition'] = f'attachment; filename=Estadistica_MPPE_{"Escuela" if modo == "escuela" else "Aula"}_Mes_{mes}.docx'
    
    return response

@app.route('/api/test', methods=['GET'])
def test():
    """Endpoint de prueba"""
    return jsonify({
        "success": True,
        "message": "API mock de estadísticas funcionando",
        "endpoints": [
            "GET /api/aulas",
            "POST /api/admin/estadistica/rango",
            "POST /api/admin/estadistica/mensual"
        ]
    })

if __name__ == '__main__':
    print("=" * 60)
    print("API Mock para pruebas de estadísticas del admin")
    print("URL: http://127.0.0.1:5001")
    print("Endpoints disponibles:")
    print("  GET  /api/aulas - Lista de aulas")
    print("  POST /api/admin/estadistica/rango - Estadísticas por rango")
    print("  POST /api/admin/estadistica/mensual - Estadística mensual MPPE")
    print("  GET  /api/test - Prueba de conexión")
    print("=" * 60)
    print("\nPara probar en admin.html, cambiar API_BASE_URL a: http://127.0.0.1:5001")
    print("O agregar en la consola del navegador: window.API_BASE_URL = 'http://127.0.0.1:5001'")
    print("=" * 60)
    
    app.run(debug=True, port=5001, host='127.0.0.1')