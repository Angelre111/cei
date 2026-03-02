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

# Obtener la ruta del directorio raíz del proyecto (un nivel arriba de /py)
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__, 
            static_folder=ROOT_DIR, 
            static_url_path='')
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
    
    # 1. Capturamos los campos separados
    nombres = data.get('nombres')
    apellidos = data.get('apellidos')
    email = data.get('email')
    telefono = data.get('telefono')
    contrasena = data.get('contrasena')

    # 2. Validamos que no falte ninguno
    if not all([nombres, apellidos, email, telefono, contrasena]):
        return jsonify({'success': False, 'message': 'Faltan datos obligatorios.'}), 400

    try:
        # 3. Enviamos a Supabase Auth usando first_name y last_name
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": contrasena,
            "options": {
                "data": {
                    "first_name": nombres,
                    "last_name": apellidos,
                    "phone": telefono
                },
                "email_redirect_to": os.getenv('REDIRECT_URL', 'http://127.0.0.1:5000/form_registro_estudiante.html')  
            }
        })
        
        if not auth_response.user and not auth_response.session:
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
    """Inicia sesión, verifica el rol/estado estrictamente y no asigna roles por defecto."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'message': 'Datos no proporcionados'}), 400
    
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'success': False, 'message': 'Email y contraseña requeridos'}), 400

    try:
        # 1. Autenticar con Supabase Auth
        response = supabase.auth.sign_in_with_password({
            "email": email, 
            "password": password
        })
        
        user_id = response.user.id
        print(f"🔍 Autenticado en Auth - ID: {user_id}")

        # 2. Consultar la tabla 'usuarios' buscando primero por ID
        user_data = supabase.table("usuarios").select("rol, estado").eq("id", user_id).execute()
        
        # Respaldo: Si falla por ID, buscamos por email (evita problemas de desincronización)
        if not user_data.data or len(user_data.data) == 0:
            print(f"⚠️ No se encontró por ID. Buscando por email: {email}")
            user_data = supabase.table("usuarios").select("rol, estado").eq("email", email).execute()

        # 3. FLUJO ESTRICTO: Si sigue sin existir, BLOQUEAMOS (No hay rol por defecto)
        if not user_data.data or len(user_data.data) == 0:
            print(f"❌ Login denegado: El usuario {email} no tiene registro en la tabla pública.")
            return jsonify({
                'success': False, 
                'message': 'Tu perfil no está registrado en el sistema. Contacta al administrador.'
            }), 403

        # 4. Extraer los valores exactos de la base de datos
        rol_usuario = user_data.data[0].get('rol')
        estado_usuario = user_data.data[0].get('estado')

        # Bloquear si la cuenta está inactiva
        if estado_usuario == 'inactivo':
             return jsonify({'success': False, 'message': 'Tu cuenta está inactiva. Verifique su cuenta antes de ingresar'}), 403

        # Guardar sesión en Flask
        session['user_id'] = user_id
        session['access_token'] = response.session.access_token

        # 5. Enviar respuesta exitosa al Frontend con el rol real
        return jsonify({
            'success': True,
            'message': 'Inicio de sesión exitoso',
            'token': response.session.access_token,
            'rol': rol_usuario,
            'user': {
                'id': user_id,
                'email': response.user.email
            }
        }), 200

    except Exception as e:
        error_msg = str(e).lower()
        print(f"⚠️ Error Login: {e}")
        
        # Si el error es claramente de credenciales de Supabase
        if "invalid login credentials" in error_msg:
            return jsonify({
                'success': False, 
                'message': 'Correo o contraseña incorrectos.'
            }), 401
            
        # Para cualquier otro error (conexión, base de datos, error de código)
        return jsonify({
            'success': False, 
            'message': 'Error interno de servidor. Por favor intente más tarde.'
        }), 500




@app.route('/api/crear_personal', methods=['POST'])
def crear_personal():
    """Ruta para que un admin cree cuentas de otros administradores o docentes. Bloquea representantes."""
    data = request.json
    
    nombres = data.get('nombres')
    apellidos = data.get('apellidos')
    email = data.get('email')
    rol_front = data.get('rol') 
    password = data.get('password')

    # 1. Validaciones básicas
    if not all([nombres, apellidos, email, rol_front, password]):
        return jsonify({'success': False, 'message': 'Todos los campos son obligatorios.'}), 400

    # Convertimos el rol del frontend ("Administrador") al formato del ENUM ("administrador")
    rol_db = rol_front.lower()

    # 2. Validación estricta de seguridad (Bloqueamos representantes)
    if rol_db not in ['administrador', 'docente']:
        return jsonify({
            'success': False, 
            'message': 'Acción denegada. Por este módulo solo se pueden crear Administradores o Docentes.'
        }), 403

    # 3. Lógica Condicional: Auto-confirmar y Estado Inicial
    # Si es administrador, se confirma directo y queda activo. Si es docente, requiere verificación y queda pendiente.
    es_admin = (rol_db == 'administrador')
    estado_inicial = 'activo' if es_admin else 'pendiente'

    try:
        # 4. Crear el usuario en Supabase Auth
        auth_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": es_admin, # <--- Aquí aplicamos la regla condicional
            "user_metadata": {
                "first_name": nombres,
                "last_name": apellidos,
                "role": rol_db
            }
        })

        nuevo_user_id = auth_response.user.id

        # 5. Guardar los datos en tu tabla pública 'usuarios'
        datos_usuario = {
            "id": nuevo_user_id,
            "nombres": nombres,
            "apellidos": apellidos,
            "email": email,
            "rol": rol_db,
            "estado": estado_inicial # <--- Guardamos como 'pendiente' a los docentes
        }
        
        supabase.table("usuarios").upsert(datos_usuario).execute()

        # 6. Preparamos un mensaje de respuesta dinámico
        mensaje_exito = f'{rol_front} registrado exitosamente en el sistema.'
        if not es_admin:
            mensaje_exito += ' Se ha enviado un correo para que el docente verifique su cuenta.'

        return jsonify({
            'success': True, 
            'message': mensaje_exito
        }), 201

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error al crear personal: {error_msg}")
        
        # Si Supabase nos dice que el correo ya existe
        if "already exists" in error_msg.lower() or "unique constraint" in error_msg.lower():
            return jsonify({'success': False, 'message': 'Este correo electrónico ya está registrado.'}), 409
            
        return jsonify({'success': False, 'message': 'Error interno del servidor al crear el usuario.'}), 500


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




@app.route('/')
def home():
    """Ruta de Health Check para que Render sepa que la API está viva."""
    return jsonify({
        "status": "online", 
        "mensaje": "API del Sistema de Gestión Escolar funcionando correctamente."
    }), 200
# =======================================================
# PUNTO DE ENTRADA
# =======================================================

if __name__ == '__main__':
    # Ejecutar en modo debug solo si estamos en desarrollo local
    print("🚀 Servidor corriendo en http://localhost:5000")
    app.run(debug=True, port=5000)