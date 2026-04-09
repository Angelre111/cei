#!/usr/bin/env python3
"""
Script para probar los endpoints de estadísticas del admin
"""

import requests
import json
from datetime import datetime, timedelta

# Configuración
BASE_URL = "http://127.0.0.1:5000"  # Cambiar si es necesario
TEST_TOKEN = "test-token-admin"  # Token de prueba

headers = {
    "Authorization": f"Bearer {TEST_TOKEN}",
    "Content-Type": "application/json"
}

def test_endpoint(method, endpoint, data=None):
    """Prueba un endpoint y muestra el resultado"""
    url = f"{BASE_URL}{endpoint}"
    
    print(f"\n{'='*60}")
    print(f"Probando: {method} {endpoint}")
    print(f"{'='*60}")
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data)
        else:
            print(f"Método no soportado: {method}")
            return
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                result = response.json()
                print(f"Respuesta: {json.dumps(result, indent=2, ensure_ascii=False)}")
            except:
                print(f"Respuesta (no JSON): {response.text[:200]}...")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Excepción: {e}")

def main():
    print("PRUEBA DE ENDPOINTS DE ESTADÍSTICAS PARA ADMIN")
    print("="*60)
    
    # 1. Obtener aulas
    test_endpoint("GET", "/api/aulas")
    
    # 2. Estadística por rango (escuela completa)
    fecha_fin = datetime.now().strftime("%Y-%m-%d")
    fecha_inicio = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    data_rango_escuela = {
        "modo": "escuela",
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin
    }
    test_endpoint("POST", "/api/admin/estadistica/rango", data_rango_escuela)
    
    # 3. Estadística por rango (por aula)
    data_rango_aula = {
        "modo": "aula",
        "aula_id": 1,  # Suponiendo que existe aula con ID 1
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin
    }
    test_endpoint("POST", "/api/admin/estadistica/rango", data_rango_aula)
    
    # 4. Estadística mensual (escuela completa)
    data_mensual_escuela = {
        "modo": "escuela",
        "mes": datetime.now().month,
        "anio": datetime.now().year,
        "dias_habiles": 20
    }
    test_endpoint("POST", "/api/admin/estadistica/mensual", data_mensual_escuela)
    
    # 5. Estadística mensual (por aula)
    data_mensual_aula = {
        "modo": "aula",
        "aula_id": 1,
        "mes": datetime.now().month,
        "anio": datetime.now().year,
        "dias_habiles": 20
    }
    test_endpoint("POST", "/api/admin/estadistica/mensual", data_mensual_aula)
    
    print(f"\n{'='*60}")
    print("PRUEBAS COMPLETADAS")
    print("="*60)
    
    print("\nResumen de endpoints implementados:")
    print("1. GET    /api/aulas                      - Lista de aulas")
    print("2. POST   /api/admin/estadistica/rango    - Estadísticas por período")
    print("3. POST   /api/admin/estadistica/mensual  - Estadística mensual MPPE")
    
    print("\nNotas:")
    print("- Para probar con el frontend, asegúrate de que el servidor Flask esté ejecutándose")
    print("- En admin.html, los endpoints se llamarán automáticamente")
    print("- El token de autenticación debe ser válido (no el token de prueba)")

if __name__ == "__main__":
    main()