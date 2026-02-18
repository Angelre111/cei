# =======================================================
# SISTEMA DE GESTIÓN ESCOLAR (API BACKEND)
# =======================================================
import os
from typing import Optional, List
from datetime import datetime

# --- LIBRERÍAS DE TERCEROS ---
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions

# --- CONFIGURACIÓN INICIAL ---
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
CORS(app) # Habilitar CORS para permitir peticiones del frontend

# Configuración de Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL')
# Usamos SERVICE_ROLE para el backend para tener permisos administrativos (bypass RLS)
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("❌ Faltan las credenciales de Supabase (URL o SERVICE_ROLE_KEY) en el archivo .env")

# Inicializar Cliente de Supabase con Service Role
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# =======================================================
# MODELOS DE DATOS (SCHEMAS)
# =======================================================

class InscripcionSchema(BaseModel):
    # Paso 1: Estudiante
    nino_nombres: str
    nino_apellidos: str
    nino_fecha_nacimiento: str
    nino_edad: Optional[int] = 0
    nino_sexo: str
    nino_lugar_nac: Optional[str] = None
    nino_cedula_escolar: Optional[str] = None
    nino_direccion: str
    
    # Paso 2: Padres
    madre_nombre: str
    madre_ci: Optional[str] = None
    madre_telefono: Optional[str] = None
    madre_ocupacion: Optional[str] = None
    padre_nombre: Optional[str] = None
    padre_telefono: Optional[str] = None
    vivienda_tipo: Optional[str] = None
    vivienda_tenencia: Optional[str] = None

    # Paso 3: Salud
    bio_cesarea: bool = False
    bio_prematuro: bool = False
    bio_alergico: bool = False
    bio_peso: Optional[float] = None
    bio_talla: Optional[float] = None
    salud_enfermedad: Optional[str] = None
    salud_fiebre: Optional[str] = None

    # Paso 4: Hábitos
    habito_come: Optional[str] = None
    habito_hora: Optional[str] = None
    conducta: List[str] = []
    user_id: str  # <--- ID del usuario en Supabase Auth


# =======================================================
# RUTAS DE AUTENTICACIÓN
# =======================================================

@app.route('/api/registrar', methods=['POST'])
def registrar_usuario():
    """Registra un nuevo usuario en Supabase Auth."""
    data = request.json
    nombre_completo = data.get('nombre_completo')
    email = data.get('email')
    telefono = data.get('telefono')
    contrasena = data.get('contrasena')

    if not all([nombre_completo, email, telefono, contrasena]):
        return jsonify({'success': False, 'message': 'Faltan datos obligatorios.'}), 400

    try:
        # Crea usuario en Auth (El trigger en BD se encarga del resto)
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": contrasena,
            "options": {
                "data": {
                    "full_name": nombre_completo,
                    "phone": telefono
                },
                "email_redirect_to": os.getenv('REDIRECT_URL', 'http://127.0.0.1:5000/form_registro_estudiante.html')  
            }
        })
        
        # Verificar si hubo error implícito (usuario ya existe suele lanzar excepción, pero por si acaso)
        if not auth_response.user and not auth_response.session:
             # Ocurre si la confirmación de email es obligatoria
             pass 

        return jsonify({
            'success': True, 
            'message': 'Registro exitoso. Por favor revisa tu correo para confirmar la cuenta.'
        }), 201

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error Registro: {error_msg}")
        return jsonify({'success': False, 'message': error_msg}), 400


@app.route('/api/login', methods=['POST'])
def login_usuario():
    """Inicia sesión y devuelve el token de acceso."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'message': 'Datos no proporcionados'}), 400
    
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'success': False, 'message': 'Email y contraseña requeridos'}), 400

    try:
        response = supabase.auth.sign_in_with_password({
            "email": email, 
            "password": password
        })

        # Guardar sesión en Flask (opcional, útil si usas templates jinja)
        session['user_id'] = response.user.id
        session['access_token'] = response.session.access_token

        return jsonify({
            'success': True,
            'message': 'Inicio de sesión exitoso',
            'token': response.session.access_token,
            'user': {
                'id': response.user.id,
                'email': response.user.email
            }
        }), 200

    except Exception as e:
        print(f"⚠️ Error Login: {e}")
        return jsonify({'success': False, 'message': 'Credenciales inválidas o error en el servidor'}), 401


# =======================================================
# RUTAS DE GESTIÓN (INSCRIPCIONES)
# =======================================================

@app.route('/api/verificar_estado/<user_id>', methods=['GET'])
def verificar_estado(user_id):
    """Verifica si un usuario ya ha completado su inscripción."""
    try:
        # Busca en la tabla 'inscripciones' si existe una fila con este user_id
        response = supabase.table("inscripciones").select("id", count="exact").eq("user_id", user_id).execute()
        
        # Si la lista de datos no está vacía, es que YA existe
        ya_existe = len(response.data) > 0
        
        return jsonify({'completado': ya_existe}), 200
    except Exception as e:
        print(f"❌ Error verificación: {e}")
        return jsonify({'completado': False}), 200 # En caso de duda, dejamos pasar

@app.route('/api/inscribir', methods=['POST'])
def inscribir_estudiante():
    """Procesa el formulario de inscripción validado."""
    try:
        # 1. Validar datos con Pydantic
        raw_data = request.get_json()
        datos = InscripcionSchema(**raw_data)

        # 2. Doble verificación de seguridad en el servidor
        verif = supabase.table("inscripciones").select("id").eq("user_id", datos.user_id).execute()
        if len(verif.data) > 0:
             return jsonify({"error": "El formulario ya fue enviado previamente."}), 409

        # 3. Mapear a estructura de base de datos
        datos_db = {
            "user_id": datos.user_id, # <--- IMPORTANTE: Guardamos quién lo llenó
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

        # 4. Insertar en Supabase
        response = supabase.table("inscripciones").insert(datos_db).execute()
        
        # Obtener ID del registro creado
        nuevo_id = response.data[0]['id'] if response.data else "registrado"
        
        return jsonify({"mensaje": "Inscripción exitosa", "id": nuevo_id}), 201

    except ValidationError as e:
        return jsonify({"error": "Datos inválidos", "detalles": e.errors()}), 422
    
    except Exception as e:
        print(f"❌ Error Servidor: {e}")
        return jsonify({"error": "Error interno al procesar la inscripción"}), 500


# =======================================================
# RUTAS DE ARCHIVOS ESTÁTICOS (FRONTEND)
# =======================================================

@app.route('/')
def index():
    return send_from_directory(os.getcwd(), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(os.getcwd(), filename)


# =======================================================
# PUNTO DE ENTRADA
# =======================================================

if __name__ == '__main__':
    # Ejecutar en modo debug solo si estamos en desarrollo local
    print("🚀 Servidor corriendo en http://localhost:5000")
    app.run(debug=True, port=5000)