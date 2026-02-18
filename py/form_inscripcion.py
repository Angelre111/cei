import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError
from typing import Optional, List

# 1. Configuración
load_dotenv()
app = Flask(__name__)
# Habilitar CORS para permitir peticiones desde tu frontend
CORS(app) 

# Conexión a Supabase (Usando tu librería 'supabase')
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# 2. Esquema de Validación (Usamos Pydantic manualmente para validar datos)
class InscripcionSchema(BaseModel):
    # Paso 1
    nino_nombres: str
    nino_apellidos: str
    nino_fecha_nacimiento: str
    nino_edad: Optional[int] = 0
    nino_sexo: str
    nino_lugar_nac: Optional[str] = None
    nino_cedula_escolar: Optional[str] = None
    nino_direccion: str
    
    # Paso 2
    madre_nombre: str
    madre_ci: Optional[str] = None
    madre_telefono: Optional[str] = None
    madre_ocupacion: Optional[str] = None
    padre_nombre: Optional[str] = None
    padre_telefono: Optional[str] = None
    vivienda_tipo: Optional[str] = None
    vivienda_tenencia: Optional[str] = None

    # Paso 3
    bio_cesarea: bool = False
    bio_prematuro: bool = False
    bio_alergico: bool = False
    bio_peso: Optional[float] = None
    bio_talla: Optional[float] = None
    salud_enfermedad: Optional[str] = None
    salud_fiebre: Optional[str] = None

    # Paso 4
    habito_come: Optional[str] = None
    habito_hora: Optional[str] = None
    conducta: List[str] = []

# 3. La Ruta (Endpoint) estilo Flask
@app.route('/api/inscribir', methods=['POST'])
def inscribir():
    try:
        # Obtener JSON del frontend
        raw_data = request.get_json()

        # Validar datos con Pydantic
        # Esto lanzará un error si los datos están mal formados
        datos = InscripcionSchema(**raw_data)

        # Preparar el diccionario para Supabase (Mapeo de nombres)
        datos_db = {
            "nombres_estudiante": datos.nino_nombres,
            "apellidos_estudiante": datos.nino_apellidos,
            "fecha_nacimiento": datos.nino_fecha_nacimiento,
            "edad_estudiante": datos.nino_edad,
            "sexo": datos.nino_sexo,
            "lugar_nacimiento": datos.nino_lugar_nac,
            "cedula_escolar": datos.nino_cedula_escolar,
            "direccion_habitacion": datos.nino_direccion,
            
            "nombre_madre": datos.madre_nombre,
            "ci_madre": datos.madre_ci,
            "telefono_madre": datos.madre_telefono,
            "ocupacion_madre": datos.madre_ocupacion,
            "nombre_padre": datos.padre_nombre,
            "telefono_padre": datos.padre_telefono,
            "tipo_vivienda": datos.vivienda_tipo,
            "tenencia_vivienda": datos.vivienda_tenencia,

            "fue_cesarea": datos.bio_cesarea,
            "es_prematuro": datos.bio_prematuro,
            "es_alergico": datos.bio_alergico,
            "peso_nacer": datos.bio_peso,
            "talla_nacer": datos.bio_talla,
            "enfermedad_cronica": datos.salud_enfermedad,
            "medicamento_fiebre": datos.salud_fiebre,

            "come_solo": datos.habito_come,
            "hora_dormir": datos.habito_hora if datos.habito_hora else None,
            "diagnostico_inicial": datos.conducta 
        }

        # Insertar en Supabase usando la librería cliente
        response = supabase.table("inscripciones").insert(datos_db).execute()

        # En Flask devolvemos jsonify
        # Accedemos a response.data[0] para obtener el ID recién creado
        return jsonify({"mensaje": "Inscripción exitosa", "id": response.data[0]['id']}), 201

    except ValidationError as e:
        # Error de validación de datos (ej: edad no es número)
        return jsonify({"error": "Datos inválidos", "detalles": e.errors()}), 422
    
    except Exception as e:
        # Error general (ej: Supabase caído, credenciales mal)
        print(f"Error servidor: {e}")
        return jsonify({"error": "Error interno del servidor"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)