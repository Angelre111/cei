# =======================================================
# SISTEMA DE GESTIÓN ESCOLAR (API BACKEND)
# =======================================================
import os
import traceback
import threading
import tempfile
import subprocess
import calendar
import uuid
import hashlib
import random
from typing import Optional, List
from datetime import datetime, date, timedelta
from functools import wraps

# --- LIBRERÍAS DE TERCEROS ---
import io
from docxtpl import DocxTemplate
from flask import Flask, request, jsonify, send_from_directory, session, send_file
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions

# --- IMPORTACIONES NUEVAS PARA REPORTLAB ---
from reportlab.lib.pagesizes import letter, portrait
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

# --- IMPORTACIONES PARA RESPALDO EN LA NUBE (GOOGLE DRIVE) ---
import json
import gzip
import shutil
from io import BytesIO
try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    import googleapiclient.discovery
    import googleapiclient.http
    from google.oauth2 import service_account
    DRIVE_AVAILABLE = True
except ImportError:
    DRIVE_AVAILABLE = False
    print("⚠️  APScheduler / google-api-python-client no instalados. El respaldo automático en Drive está deshabilitado.")

# --- CONFIGURACIÓN INICIAL ---
load_dotenv()

# Obtener la ruta del directorio raíz del proyecto (un nivel arriba de /py)
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__, 
            static_folder=ROOT_DIR, 
            static_url_path='')
app.secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
# CORS: Orígenes permitidos
# En producción: el frontend vive en Netlify y llama al backend en Render
# En desarrollo: soportar Flask:5000 y LiveServer:5500
DEFAULT_ORIGINS = (
    'http://127.0.0.1:5000,'
    'http://localhost:5000,'
    'http://127.0.0.1:5500,'
    'http://localhost:5500,'
    'https://cei-teh4.onrender.com,'
    'https://cei-preescolar.onrender.com'
)
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', DEFAULT_ORIGINS).split(',')
CORS(app,
     origins=ALLOWED_ORIGINS,
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     automatic_options=True)   # flask-cors responde OPTIONS sin pasar por @require_auth

# =======================================================
# RUTA DE PRUEBA (HEALTH CHECK)
# =======================================================
@app.route('/test-ping')
def test_ping():
    return "pong", 200

# =======================================================
# RATE LIMITING
# =======================================================
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=[],          # Sin límite global; lo controlamos por ruta
    storage_uri="memory://"     # En producción puedes cambiarlo a Redis
)

# =======================================================
# CAPTCHA PROPIO (Auto-hospedado, sin dependencias externas)
# =======================================================
_captcha_store = {}          # { captcha_id: { 'answer_hash': str, 'expiry': datetime } }
_captcha_lock = threading.Lock()

def _hash_answer(respuesta: str) -> str:
    return hashlib.sha256(respuesta.strip().encode()).hexdigest()

def _limpiar_captchas_expirados():
    """Elimina del store los captchas que ya expiraron."""
    ahora = datetime.utcnow()
    with _captcha_lock:
        expirados = [k for k, v in _captcha_store.items() if v['expiry'] < ahora]
        for k in expirados:
            del _captcha_store[k]

@app.route('/api/captcha', methods=['GET'])
@limiter.limit("20 per minute")  # Evitar flooding de generación
def generar_captcha():
    """Genera un desafío matemático simple. La respuesta vive solo en el servidor."""
    _limpiar_captchas_expirados()

    operadores = [
        ('+', lambda a, b: a + b),
        ('-', lambda a, b: a - b),
        ('×', lambda a, b: a * b),
    ]
    # Números pequeños para que sea trivial para humanos
    a = random.randint(2, 9)
    b = random.randint(2, 9)
    simbolo, fn = random.choice(operadores)

    # Para restas, aseguramos resultado positivo
    if simbolo == '-' and b > a:
        a, b = b, a
    # Para multiplicación, limitamos el resultado a un número cómodo
    if simbolo == '×':
        a = random.randint(2, 5)
        b = random.randint(2, 5)

    respuesta_correcta = str(fn(a, b))
    pregunta = f"¿Cuánto es {a} {simbolo} {b}?"

    captcha_id = str(uuid.uuid4())
    expiry = datetime.utcnow() + timedelta(minutes=5)

    with _captcha_lock:
        _captcha_store[captcha_id] = {
            'answer_hash': _hash_answer(respuesta_correcta),
            'expiry': expiry
        }

    return jsonify({'id': captcha_id, 'pregunta': pregunta}), 200



# =======================================================
# SEGURIDAD: DECORADOR DE AUTENTICACIÓN
# =======================================================

def require_auth(f):
    """
    Decorador que protege una ruta verificando el token JWT de Supabase.
    El frontend debe enviar el header: Authorization: Bearer <token>
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 1. Leer el header 'Authorization' de la petición
        auth_header = request.headers.get('Authorization')
        
        # Permitir token por query parameter (útil para window.open en descargas)
        if not auth_header and request.args.get('token'):
            auth_header = f"Bearer {request.args.get('token')}"

        # 2. Si no existe el header o no tiene el formato correcto, rechazar
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({
                'success': False,
                'message': 'Acceso denegado. Se requiere autenticación (token no proporcionado).'
            }), 401

        # 3. Extraer el token (quitamos el prefijo 'Bearer ')
        token = auth_header.split(' ')[1]

        # 4. Validar con supabase_auth de forma síncrona
        #    (Eliminamos el threading para evitar deadlocks de httpx/SSL en Windows)
        try:
            user_response = supabase_auth.auth.get_user(token)
        except Exception as e:
            print(f"🔒 Token rechazado (Error Supabase): {e}")
            return jsonify({
                'success': False,
                'message': 'Token inválido o expirado. Por favor inicia sesión nuevamente.'
            }), 401
        
        if not user_response or not user_response.user:
            return jsonify({
                'success': False,
                'message': 'Token inválido.'
            }), 401

        # 5. Token válido. Guardamos el usuario en 'request'.
        request.current_user = user_response.user

        # 6. Todo OK: dejamos pasar la petición a la ruta real
        return f(*args, **kwargs)

    return decorated_function

# Configuración de Supabase
SUPABASE_URL             = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
SUPABASE_ANON_KEY         = os.getenv('SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("❌ Faltan las credenciales de Supabase en el archivo .env")

# ─────────────────────────────────────────────────────────
# DOS CLIENTES SEPARADOS — MUY IMPORTANTE:
#
# La librería supabase-py muta el estado interno del cliente
# cuando se llama a auth.get_user(token). Esto reemplaza el
# SERVICE_ROLE_KEY con el JWT del usuario, lo que hace fallar
# las llamadas admin.* posteriores con "User not allowed".
#
# Solución: cliente separado solo para validar tokens.
# ─────────────────────────────────────────────────────────

# Cliente ADMIN — SERVICE_ROLE — Para BD y operaciones admin
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Cliente AUTH — ANON KEY — Solo para validar tokens de usuarios
supabase_auth: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY)


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
    nino_direccion: str
    
    # Paso 2: Padres
    madre_nombre: str
    madre_ci: str
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
    """Registra un nuevo REPRESENTANTE en Supabase Auth y en la tabla usuarios."""
    data = request.json
    
    # 1. Capturamos los campos exactos que manda tu HTML
    nombres = data.get('nombres')
    apellidos = data.get('apellidos')
    email = data.get('email')
    telefono = data.get('phone')      # <--- Ajustado al HTML
    contrasena = data.get('password') # <--- Ajustado al HTML

    # 2. Validamos que no falte ninguno
    if not all([nombres, apellidos, email, telefono, contrasena]):
        return jsonify({'success': False, 'message': 'Faltan datos obligatorios.'}), 400

    # ---> NUEVO PASO: Verificar en la BD pública antes de llamar a Auth <---
    try:
        usuario_existente = supabase.table("usuarios").select("id").eq("email", email).execute()
        if usuario_existente.data and len(usuario_existente.data) > 0:
            return jsonify({'success': False, 'message': 'Este correo electrónico ya está registrado en el sistema.'}), 409
    except Exception as e:
        print(f"⚠️ Error al verificar existencia previa: {e}")
        # Si falla la consulta por error de red, dejamos que el código siga a ver qué pasa

    try:
        # 3. Crear el usuario en el sistema de Autenticación de Supabase
        auth_response = supabase_auth.auth.sign_up({
            "email": email,
            "password": contrasena,
            "options": {
                "data": {
                    "first_name": nombres,
                    "last_name": apellidos,
                    "phone": telefono,
                    "role": "representante" # Metadato útil
                },
                # Aquí Supabase enviará el correo con el token mágico
                "email_redirect_to": os.getenv('REDIRECT_URL', 'https://cei-teh4.onrender.com/form_registro_estudiante.html')  
            }
        })
        
        # 4. Guardar directamente en tu tabla pública 'usuarios'
        if auth_response.user:
            nuevo_user_id = auth_response.user.id
            
            datos_usuario = {
                "id": nuevo_user_id,
                "nombres": nombres,
                "apellidos": apellidos,
                "email": email,
                "rol": "representante", # <--- Le asignamos su rol
                "estado": "pendiente"   # <--- Pendiente hasta que verifique su correo
            }
            
            # Usamos el cliente admin (service_role) para insertar en la tabla
            supabase.table("usuarios").insert(datos_usuario).execute()

        return jsonify({
            'success': True, 
            'message': 'Registro exitoso. Por favor revisa tu correo para confirmar la cuenta.'
        }), 201

    except Exception as e:
        error_msg = str(e).lower() 
        print(f"❌ Error Registro: {error_msg}")
        
        # 1. Atrapamos errores de "Usuario ya existe" (Auth o código 23505 de llave duplicada en BD)
        if any(keyword in error_msg for keyword in ["already registered", "already exists", "unique constraint", "duplicate key", "23505", "already in use"]):
            return jsonify({'success': False, 'message': 'Este correo electrónico ya está registrado en el sistema.'}), 409
            
        # 2. Atrapamos errores de límite de pruebas de Supabase (Rate Limit)
        if "rate limit" in error_msg or "too many requests" in error_msg:
            return jsonify({'success': False, 'message': 'Has intentado registrarte demasiadas veces seguidas. Por favor, espera unos minutos.'}), 429
            
        # 3. Error genérico de respaldo
        return jsonify({'success': False, 'message': 'No se pudo completar el registro. Intenta de nuevo.'}), 500


@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per minute")  # Máx 10 intentos de login por minuto por IP
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
        # 1. Autenticar con Supabase Auth (usamos el cliente secundario para no mutar el admin)
        response = supabase_auth.auth.sign_in_with_password({
            "email": email, 
            "password": password
        })
        
        user_id = response.user.id
        print(f"🔍 Autenticado en Auth - ID: {user_id}")

        # 2. Consultar la tabla 'usuarios' buscando primero por ID
        user_data = supabase.table("usuarios").select("rol, estado, nombres, apellidos").eq("id", user_id).execute()
        
        # Respaldo: Si falla por ID, buscamos por email (evita problemas de desincronización)
        if not user_data.data or len(user_data.data) == 0:
            print(f"⚠️ No se encontró por ID. Buscando por email: {email}")
            user_data = supabase.table("usuarios").select("rol, estado, nombres, apellidos").eq("email", email).execute()

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
        
        # Por defecto, asumimos perfil completado a menos que se demuestre lo contrario
        perfil_completado_flag = True 
        
        # Si es docente o administrador, verificar el estado en perfiles_personal
        if rol_usuario in ['docente', 'administrador']:
            perfil_personal_res = supabase.table("perfiles_personal").select("perfil_completado").eq("usuario_id", user_id).execute()
            if perfil_personal_res.data and len(perfil_personal_res.data) > 0:
                perfil_completado_flag = perfil_personal_res.data[0].get('perfil_completado', False)
                # Si el perfil no está completado, sobrescribimos el estado_usuario para forzar redirección
                if not perfil_completado_flag:
                    estado_usuario = 'perfil_incompleto' 
            else:
                # Si no hay registro en perfiles_personal, significa que no ha completado el perfil
                perfil_completado_flag = False
                estado_usuario = 'perfil_incompleto'

        # Bloquear a cualquier usuario inactivo (Ej. suspendidos por la directiva)
        if estado_usuario == 'inactivo':
             return jsonify({
                 'success': False, 
                 'message': 'Tu cuenta está inactiva. Contacta a la dirección del plantel.'
             }), 403

        # NUEVO: Manejar estado invitado (Aceptó invitación pero falta completar perfil)
        # Esto ahora incluye a los que se detectaron con 'perfil_incompleto'
        if estado_usuario == 'invitado' or estado_usuario == 'perfil_incompleto':
            return jsonify({
                'success': True,
                'message': 'Bienvenido. Debes completar tus datos básicos para activar tu cuenta.',
                'token': response.session.access_token,
                'refresh_token': response.session.refresh_token,
                'rol': rol_usuario,
                'estado': estado_usuario,
                'require_profile': not perfil_completado_flag, # Si perfil_completado_flag es False, entonces require_profile es True
                'user': {
                    'id': user_id,
                    'email': response.user.email
                }
            }), 200

        # Lógica inteligente para cuentas "pendientes"
        if estado_usuario == 'pendiente':
            if rol_usuario == 'representante':
                # Lo dejamos continuar con su estado "pendiente".
                # El frontend detectará que no tiene ficha y lo atrapará en la pantalla de inscripción.
                print(f"⚠️ Representante {email} ingresa como pendiente para llenar ficha obligatoria.")
                pass 
            else:
                # Si es docente o admin, mantenemos el bloqueo estricto
                return jsonify({
                    'success': False, 
                    'message': 'Tu cuenta está pendiente de verificación o inactiva. Revisa tu correo electrónico para verificarla.'
                }), 403

        # Guardar sesión en Flask
        session['user_id'] = user_id
        session['access_token'] = response.session.access_token

        # 5. Para representantes, verificar si ya completaron la ficha del estudiante
        ficha_completada = None
        if rol_usuario == 'representante':
            ficha_res = supabase.table("inscripciones").select("id").eq("user_id", user_id).execute()
            ficha_completada = len(ficha_res.data) > 0
            
        # NUEVA VALIDACIÓN: Si es docente, verificar si tiene aula asignada
        elif rol_usuario == 'docente':
            sec_res = supabase.table("docentes_secciones").select("seccion_id").eq("docente_id", user_id).execute()
            if not sec_res.data or len(sec_res.data) == 0:
                print(f"❌ Login denegado: La docente {email} no tiene sección asignada.")
                return jsonify({
                    'success': False, 
                    'message': 'Aún no tienes un aula asignada. Por favor, contacta a la dirección para que te asignen una sección antes de ingresar.'
                }), 403

        # 6. Enviar respuesta exitosa al Frontend con el rol real
        return jsonify({
            'success': True,
            'message': 'Inicio de sesión exitoso',
            'token': response.session.access_token,
            'refresh_token': response.session.refresh_token,
            'rol': rol_usuario,
            'estado': estado_usuario,
            'ficha_completada': ficha_completada,  # None para admin/docentes, True/False para representantes
            'user': {
                'id': user_id,
                'email': response.user.email,
                'nombres': user_data.data[0].get('nombres', ''),
                'apellidos': user_data.data[0].get('apellidos', ''),
                'perfil_completado': perfil_completado_flag  # Incluido para admin/docente; True para representantes
            }
        }), 200

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"⚠️ Error Login Critico: {e}")
        print(error_details)
        
        error_msg = str(e).lower()
        
        # NUEVO: Si no ha verificado el correo en Supabase
        if "email not confirmed" in error_msg:
            return jsonify({
                'success': False, 
                'message': 'Debes verificar tu correo electrónico antes de iniciar sesión. Por favor, revisa tu bandeja de entrada o la carpeta de Spam.'
            }), 403
            
        # Si el error es claramente de credenciales de Supabase
        if "invalid login credentials" in error_msg:
            # Verificar si existe como invitado sin clave
            try:
                user_check = supabase.table("usuarios").select("estado").eq("email", email).limit(1).execute()
                if user_check.data and user_check.data[0].get("estado") == "invitado":
                    return jsonify({
                        'success': False, 
                        'message': 'Debes registrar tu clave mediante el enlace de invitación enviado a tu correo antes de ingresar.'
                    }), 403
            except Exception:
                pass

            return jsonify({
                'success': False, 
                'message': 'Correo o contraseña incorrectos.'
            }), 401
            
        # Para cualquier otro error (conexión, base de datos, error de código)
        return jsonify({
            'success': False, 
            'message': 'Error interno de servidor. Por favor intente más tarde.'
        }), 500


@app.route('/api/recuperar-password', methods=['POST'])
@limiter.limit("5 per minute")  # Máx 5 intentos por minuto por IP
def recuperar_password():
    """Envía un enlace mágico al correo del usuario para restablecer la contraseña."""
    data = request.json
    email = data.get('email', '').strip()
    captcha_id = data.get('captcha_id', '').strip()
    captcha_respuesta = data.get('captcha_respuesta', '').strip()

    if not email:
        return jsonify({'success': False, 'message': 'El correo es obligatorio.'}), 400

    # --- Verificar CAPTCHA propio ---
    ahora = datetime.utcnow()
    with _captcha_lock:
        registro = _captcha_store.get(captcha_id)
        if not registro:
            return jsonify({'success': False, 'message': 'El desafío de seguridad no es válido o ya fue usado. Recarga e intenta de nuevo.'}), 400
        if registro['expiry'] < ahora:
            del _captcha_store[captcha_id]
            return jsonify({'success': False, 'message': 'El desafío de seguridad expiró. Intenta de nuevo.'}), 400
        if _hash_answer(captcha_respuesta) != registro['answer_hash']:
            # No eliminamos el registro para no dar pistas de cuántos intentos quedan
            return jsonify({'success': False, 'message': 'Respuesta incorrecta. Inténtalo de nuevo.'}), 400
        # ✅ Correcto: eliminar para que no se reutilice
        del _captcha_store[captcha_id]

    try:
        # 1. Verificar si el usuario existe en nuestra tabla pública
        res_user = supabase.table("usuarios").select("id").eq("email", email).execute()
        
        if not res_user.data:
            # CAMBIO: Ahora informamos explícitamente al frontend si el correo NO existe
            return jsonify({
                'success': False, 
                'message': 'El correo ingresado no existe en nuestro sistema. Verifica que esté bien escrito o contacta a la institución.'
            }), 404

        # 2. Configurar a dónde irá el usuario cuando haga clic en el correo
        redirect_url = os.getenv('RESET_PASSWORD_URL', 'https://cei-teh4.onrender.com/restablecer.html')
        
        # 3. Disparar el correo usando el SMTP de Supabase
        supabase_auth.auth.reset_password_for_email(
            email, 
            options={"redirect_to": redirect_url}
        )

        return jsonify({'success': True, 'message': 'Enlace de recuperación enviado.'}), 200

    except Exception as e:
        print(f"❌ Error al recuperar password: {e}")
        return jsonify({'success': False, 'message': 'Error interno al procesar la solicitud.'}), 500


@app.route('/api/crear_personal', methods=['POST'])
@require_auth
def crear_personal():
    """Invita a un nuevo administrador o docente mediante correo electrónico."""
    # Verificar que el solicitante sea administrador
    user_id_solicitante = request.current_user.id
    perfil = supabase.table("usuarios").select("rol").eq("id", user_id_solicitante).single().execute()
    if not perfil.data or perfil.data.get("rol") != "administrador":
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    data = request.json
    email = data.get('email', '').strip()
    rol_front = data.get('rol', '').strip().lower()  # "administrador" o "docente"

    if not email or not rol_front:
        return jsonify({'success': False, 'message': 'Correo electrónico y rol son obligatorios.'}), 400

    if rol_front not in ['administrador', 'docente']:
        return jsonify({'success': False, 'message': 'Rol inválido. Debe ser "administrador" o "docente".'}), 400

    try:
        # 1. Verificar si el correo ya está registrado en auth o en la tabla usuarios
        existing_user = supabase.table("usuarios").select("id").eq("email", email).execute()
        if existing_user.data:
            return jsonify({'success': False, 'message': 'Este correo electrónico ya está registrado en el sistema.'}), 409

        # 2. Enviar invitación por correo (sin contraseña)
        # Asegúrate de tener SET_PASSWORD_URL en tu .env o usa la por defecto
        redirect_url = os.getenv('SET_PASSWORD_URL', 'https://cei-teh4.onrender.com/set_password.html')
        auth_response = supabase.auth.admin.invite_user_by_email(
            email,
            options={
                "data": {
                    "role": rol_front
                },
                "redirect_to": redirect_url
            }
        )

        nuevo_user_id = auth_response.user.id

        # 3. Insertar registro en la tabla pública 'usuarios' con estado 'invitado'
        datos_usuario = {
            "id": nuevo_user_id,
            "email": email,
            "rol": rol_front,
            "estado": "invitado",    # esperando que el usuario acepte la invitación
            "nombres": "",           # vacío hasta que complete perfil
            "apellidos": ""          # vacío hasta que complete perfil
        }
        supabase.table("usuarios").insert(datos_usuario).execute()

        # 4. Inicializar registro en 'perfiles_personal' (solo para admin/docente)
        datos_perfil = {
            "usuario_id": nuevo_user_id,
            "perfil_completado": False
        }
        supabase.table("perfiles_personal").insert(datos_perfil).execute()

        return jsonify({
            'success': True,
            'message': f'Invitación enviada a {email}. El usuario recibirá un correo para crear su cuenta.'
        }), 201

    except Exception as e:
        error_msg = str(e).lower()
        print(f"❌ Error al invitar usuario: {error_msg}")
        if "already registered" in error_msg or "already exists" in error_msg:
            return jsonify({'success': False, 'message': 'Este correo electrónico ya está registrado en Supabase.'}), 409
        return jsonify({'success': False, 'message': 'Error al enviar la invitación. Intenta de nuevo.'}), 500

@app.route('/api/reenviar_invitacion', methods=['POST'])
@require_auth
def reenviar_invitacion():
    """Reenvía la invitación (usando reset_password_email) para los que no completaron la clave."""
    user_id_solicitante = request.current_user.id
    perfil = supabase.table("usuarios").select("rol").eq("id", user_id_solicitante).single().execute()
    if not perfil.data or perfil.data.get("rol") != "administrador":
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    email = request.json.get('email', '').strip()
    if not email:
        return jsonify({'success': False, 'message': 'Correo electrónico obligatorio.'}), 400

    try:
        redirect_url = os.getenv('SET_PASSWORD_URL', 'https://cei-teh4.onrender.com/set_password.html')
        supabase_auth.auth.reset_password_for_email(email, options={"redirect_to": redirect_url})
        return jsonify({'success': True, 'message': f'Invitación reenviada a {email}.'}), 200
    except Exception as e:
        print(f"❌ Error al reenviar invitación a {email}: {e}")
        return jsonify({'success': False, 'message': 'Error al reenviar invitación.'}), 500

@app.route('/api/completar-perfil', methods=['POST'])
@require_auth
def completar_perfil():
    """Completa el perfil de un usuario invitado (docente o administrador).
    Guarda datos básicos en 'usuarios' y datos profesionales en 'perfiles_personal',
    marcando perfil_completado = True al finalizar.
    """
    try:
        data = request.json
        user_id = request.current_user.id
        
        # 1. Obtener el rol del usuario
        perfil_res = supabase.table("usuarios").select("rol").eq("id", user_id).single().execute()
        rol = perfil_res.data.get("rol") if perfil_res.data else None

        if rol not in ['docente', 'administrador']:
            return jsonify({'success': False, 'message': 'Solo docentes y administradores pueden completar este perfil.'}), 403

        nombres = data.get('nombres', '').strip()
        apellidos = data.get('apellidos', '').strip()
        telefono = data.get('telefono', '').strip()

        if not nombres or not apellidos:
            return jsonify({'success': False, 'message': 'Nombres y apellidos son obligatorios.'}), 400

        # 2. Actualizar datos básicos en la tabla 'usuarios'
        actualizacion_usuario = {
            "nombres": nombres,
            "apellidos": apellidos,
            "telefono": telefono if telefono else None,
            "estado": "activo"   # Activar cuenta definitivamente
        }
        supabase.table("usuarios").update(actualizacion_usuario).eq("id", user_id).execute()

        # 3. Actualizar/Insertar datos profesionales en 'perfiles_personal'
        datos_perfil = {
            "usuario_id": user_id,
            "perfil_completado": True,
        }
        if data.get('fecha_nacimiento'):
            datos_perfil["fecha_nacimiento"] = data.get('fecha_nacimiento')
        if data.get('codigo_cargo'):
            datos_perfil["codigo_cargo"] = data.get('codigo_cargo').strip().upper()
        if data.get('tipo_cargo'):
            datos_perfil["tipo_cargo"] = data.get('tipo_cargo').strip().upper()
        if data.get('talla_zapato'):
            datos_perfil["talla_zapato"] = data.get('talla_zapato').strip()
        if data.get('talla_camisa'):
            datos_perfil["talla_camisa"] = data.get('talla_camisa').strip()
        if data.get('talla_pantalon'):
            datos_perfil["talla_pantalon"] = data.get('talla_pantalon').strip()

        # Upsert: inserta si no existe, actualiza si ya existe (por usuario_id)
        supabase.table("perfiles_personal").upsert(
            datos_perfil,
            on_conflict="usuario_id"
        ).execute()

        print(f"✅ Perfil completado para usuario {user_id} ({rol})")
        return jsonify({'success': True, 'message': 'Perfil completado y cuenta activada con éxito.'}), 200

    except Exception as e:
        print(f"❌ Error al completar perfil: {e}")
        return jsonify({'success': False, 'message': 'Error interno al actualizar el perfil.'}), 500


# =======================================================
# RUTAS DE GESTIÓN DE USUARIOS
# =======================================================

@app.route('/api/usuarios', methods=['GET'])
@require_auth
def listar_usuarios():
    """Devuelve la lista de usuarios según tipo: personal (admin+docente) o representante.
    Para representantes sin nombre (invitados por admin), enriquece con datos de inscripciones.
    """
    tipo = request.args.get('tipo', 'personal')
    roles_filtro = ['representante'] if tipo in ('representante', 'representantes') else ['administrador', 'docente']

    try:
        response = supabase.table("usuarios") \
            .select("id, nombres, apellidos, email, rol, estado") \
            .in_("rol", roles_filtro) \
            .order("created_at", desc=True) \
            .execute()

        usuarios = response.data or []

        # Para representantes sin nombre (invitados), buscar nombre en inscripciones
        if roles_filtro == ['representante']:
            for u in usuarios:
                nombre_completo = f"{u.get('nombres', '')} {u.get('apellidos', '')}".strip()
                if not nombre_completo:
                    # Buscar en inscripciones: nombre_madre es el campo más completo
                    try:
                        ins_res = supabase.table("inscripciones") \
                            .select("nombre_madre, ci_madre") \
                            .eq("user_id", u['id']) \
                            .limit(1) \
                            .execute()
                        if ins_res.data:
                            ins = ins_res.data[0]
                            partes = (ins.get('nombre_madre') or '').split()
                            if partes:
                                u['nombres']   = ' '.join(partes[:-1]) if len(partes) > 1 else partes[0]
                                u['apellidos'] = partes[-1] if len(partes) > 1 else ''
                            if ins.get('ci_madre'):
                                u['ci'] = ins['ci_madre']
                    except Exception as ex:
                        print(f"⚠️ No se pudo enriquecer nombre del representante {u['id']}: {ex}")

        return jsonify({'success': True, 'usuarios': usuarios}), 200

    except Exception as e:
        print(f"❌ Error al listar usuarios: {e}")
        return jsonify({'success': False, 'message': 'Error al obtener usuarios.'}), 500


@app.route('/api/activar_cuenta', methods=['POST'])
@require_auth
def activar_cuenta():
    """Marca la cuenta del usuario autenticado como 'activo' tras establecer su contraseña.
    Llamado desde set_password.html justo después de supabase.auth.updateUser().
    """
    try:
        user_id = request.current_user.id
        supabase.table("usuarios").update({"estado": "activo"}).eq("id", user_id).execute()
        print(f"✅ Cuenta activada tras set_password: {user_id}")
        return jsonify({'success': True, 'message': 'Cuenta activada correctamente.'}), 200
    except Exception as e:
        print(f"❌ Error al activar cuenta: {e}")
        return jsonify({'success': False, 'message': 'No se pudo activar la cuenta.'}), 500


@app.route('/api/mi_perfil', methods=['GET'])
@require_auth
def mi_perfil():
    """Devuelve el perfil completo del usuario autenticado (datos básicos + profesionales)."""
    try:
        user_id = request.current_user.id
        
        # 1. Datos básicos de la tabla 'usuarios'
        perfil = supabase.table("usuarios").select(
            "rol, estado, nombres, apellidos, email, telefono"
        ).eq("id", user_id).single().execute()
        
        if not perfil.data:
            return jsonify({'success': False, 'message': 'Usuario no encontrado.'}), 404
            
        # 2. Datos profesionales de la tabla 'perfiles_personal'
        perfil_personal = supabase.table("perfiles_personal").select(
            "fecha_nacimiento, codigo_cargo, tipo_cargo, talla_zapato, talla_camisa, talla_pantalon, perfil_completado"
        ).eq("usuario_id", user_id).single().execute()
        
        personal_data = perfil_personal.data if perfil_personal.data else {}
        
        return jsonify({
            'success': True,
            **perfil.data,
            'fecha_nacimiento': personal_data.get('fecha_nacimiento'),
            'codigo_cargo': personal_data.get('codigo_cargo'),
            'tipo_cargo': personal_data.get('tipo_cargo'),
            'talla_zapato': personal_data.get('talla_zapato'),
            'talla_camisa': personal_data.get('talla_camisa'),
            'talla_pantalon': personal_data.get('talla_pantalon'),
            'perfil_completado': personal_data.get('perfil_completado', False)
        }), 200
        
    except Exception as e:
        print(f"❌ Error en mi_perfil: {e}")
        return jsonify({'success': False, 'message': 'Error interno.'}), 500


@app.route('/api/perfil', methods=['PUT'])
@require_auth
def actualizar_perfil():
    """Actualiza los datos profesionales del usuario autenticado."""
    try:
        user_id = request.current_user.id
        data = request.get_json(silent=True) or {}
        
        # Campos permitidos (solo los de perfiles_personal)
        campos_permitidos = [
            'fecha_nacimiento', 'codigo_cargo', 'tipo_cargo', 
            'talla_zapato', 'talla_camisa', 'talla_pantalon'
        ]
        datos_update = {k: v for k, v in data.items() if k in campos_permitidos and v is not None}
        
        if not datos_update:
            return jsonify({'success': False, 'message': 'No hay campos válidos para actualizar.'}), 400
            
        # Agregar el usuario_id y marcar perfil como completado
        datos_update['usuario_id'] = user_id
        datos_update['perfil_completado'] = True
        
        # Upsert: si existe el registro lo actualiza, si no lo inserta
        supabase.table("perfiles_personal").upsert(
            datos_update,
            on_conflict="usuario_id"
        ).execute()
        
        # También actualizar el estado del usuario si estaba en 'invitado' o 'perfil_incompleto'
        supabase.table("usuarios").update({"estado": "activo"}).eq("id", user_id).execute()
        
        return jsonify({'success': True, 'message': 'Perfil actualizado correctamente.'}), 200
        
    except Exception as e:
        print(f"❌ Error al actualizar perfil: {e}")
        return jsonify({'success': False, 'message': 'Error interno al actualizar el perfil.'}), 500


@app.route('/api/usuarios/<user_id>', methods=['PUT'])
@require_auth
def editar_usuario(user_id):
    """Actualiza los datos editables de un usuario (nombres, apellidos, estado)."""
    # Solo administradores pueden editar
    solicitante_id = request.current_user.id
    perfil = supabase.table("usuarios").select("rol").eq("id", solicitante_id).single().execute()
    if not perfil.data or perfil.data.get("rol") != "administrador":
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    data = request.get_json()
    campos_permitidos = ['nombres', 'apellidos', 'estado', 'rol', 'email']
    datos_update = {k: v for k, v in data.items() if k in campos_permitidos and v is not None}

    # Validación estricta del rol si viene en la petición
    if 'rol' in datos_update and datos_update['rol'] not in ['administrador', 'docente', 'representante']:
        return jsonify({'success': False, 'message': 'Rol inválido.'}), 400

    # Seguridad: Un admin no puede cambiar su propio rol ni estado (se quedaría sin acceso)
    if solicitante_id == user_id and ('rol' in datos_update or 'estado' in datos_update):
        return jsonify({'success': False, 'message': 'No puedes cambiar tu propio rol ni estado.'}), 400

    if not datos_update:
        return jsonify({'success': False, 'message': 'No hay campos válidos para actualizar.'}), 400

    # Actualizar correo en Auth de Supabase (Importante para que el login también cambie)
    if 'email' in datos_update:
        try:
            supabase.auth.admin.update_user_by_id(user_id, {"email": datos_update['email'], "email_confirm": True})
        except Exception as ex:
            print(f"Error actualizando email en auth: {ex}")
            return jsonify({'success': False, 'message': 'No se pudo actualizar el correo. Puede que ya esté en uso o sea inválido.'}), 400

    try:
        supabase.table("usuarios").update(datos_update).eq("id", user_id).execute()

        # Si a un docente se le activa la cuenta manualmente, saltamos la verificacion por correo
        if datos_update.get('estado') == 'activo':
            rol_verificar = datos_update.get('rol')
            if not rol_verificar:
                # Si no vinieron los datos del rol en el payload, buscar el actual
                res_rol = supabase.table("usuarios").select("rol").eq("id", user_id).single().execute()
                if res_rol.data:
                    rol_verificar = res_rol.data.get("rol")
            
            if rol_verificar == 'docente':
                try:
                    supabase.auth.admin.update_user_by_id(user_id, {"email_confirm": True})
                    print(f"✅ Auto-verificación de correo aplicada al docente activado ({user_id})")
                except Exception as ex:
                    print(f"⚠️ Aviso: Falló auto-verificar correo del docente en Auth: {ex}")

        return jsonify({'success': True, 'message': 'Usuario actualizado correctamente.'}), 200

    except Exception as e:
        print(f"❌ Error al editar usuario: {e}")
        return jsonify({'success': False, 'message': 'Error al actualizar el usuario.'}), 500


@app.route('/api/usuarios/<user_id>', methods=['DELETE'])
@require_auth
def eliminar_usuario(user_id):
    """Elimina un usuario del sistema: primero de la tabla pública, luego de Supabase Auth."""
    # Solo administradores pueden eliminar
    solicitante_id = request.current_user.id

    # Evitar que un admin se elimine a sí mismo
    if solicitante_id == user_id:
        return jsonify({'success': False, 'message': 'No puedes eliminar tu propia cuenta.'}), 400

    perfil = supabase.table("usuarios").select("rol").eq("id", solicitante_id).single().execute()
    if not perfil.data or perfil.data.get("rol") != "administrador":
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    try:
        # 1. Eliminar de la tabla pública primero
        supabase.table("usuarios").delete().eq("id", user_id).execute()

        # 2. Eliminar de Supabase Auth (requiere service_role)
        supabase.auth.admin.delete_user(user_id)

        return jsonify({'success': True, 'message': 'Usuario eliminado del sistema correctamente.'}), 200

    except Exception as e:
        print(f"❌ Error al eliminar usuario: {e}")
        return jsonify({'success': False, 'message': 'Error al eliminar el usuario.'}), 500


# =======================================================
# RUTAS DE GESTIÓN (INSCRIPCIONES / ESTUDIANTES)
# =======================================================

def _nombre_representante(rep_id: str) -> str:
    """Devuelve el nombre completo del representante.
    Si la tabla `usuarios` tiene el nombre vacío (invitado por admin sin
    completar perfil), hace fallback a `inscripciones.nombre_madre`.
    """
    if not rep_id:
        return "Sin representante"
    try:
        res_u = supabase.table("usuarios") \
            .select("nombres, apellidos") \
            .eq("id", rep_id).limit(1).execute()
        if res_u.data:
            nombre = f"{res_u.data[0].get('nombres', '')} {res_u.data[0].get('apellidos', '')}".strip()
            if nombre:
                return nombre
        # Fallback: buscar nombre_madre en inscripciones
        res_i = supabase.table("inscripciones") \
            .select("nombre_madre") \
            .eq("user_id", rep_id).limit(1).execute()
        if res_i.data and res_i.data[0].get("nombre_madre"):
            return res_i.data[0]["nombre_madre"].strip()
    except Exception as ex:
        print(f"⚠️ _nombre_representante({rep_id}): {ex}")
    return "Desconocido"


@app.route('/api/admin/registrar_estudiante', methods=['POST'])
@require_auth
def admin_registrar_estudiante():
    """Admin (o representante) registra un estudiante directamente en el sistema."""
    current_user = request.current_user

    # Verificar que sea administrador o representante
    user_data = supabase.table("usuarios").select("rol").eq("id", current_user.id).execute()
    rol_solicitante = user_data.data[0].get('rol') if user_data.data else None
    if rol_solicitante not in ['administrador', 'representante']:
        return jsonify({'success': False, 'message': 'Acceso no autorizado.'}), 403

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'message': 'Datos no proporcionados'}), 400

    # ── Datos del estudiante ──────────────────────────────────────────────────
    nombre           = data.get('nombre', '').strip()
    apellidos        = data.get('apellidos', '').strip()
    fecha_nacimiento = data.get('fecha_nacimiento', '').strip()
    sexo             = data.get('sexo', '').strip()
    lugar_nacimiento = data.get('lugar_nacimiento', '').strip()
    direccion        = data.get('direccion', '').strip()
    seccion_id       = data.get('seccion_id') or None
    ci_rep           = data.get('ci_representante', '').strip() or '00000000'

    if not all([nombre, apellidos, fecha_nacimiento, sexo]):
        return jsonify({'success': False, 'message': 'Faltan datos obligatorios: nombre, apellidos, fecha de nacimiento y sexo.'}), 400

    # ── Determinar el representante ───────────────────────────────────────────
    if rol_solicitante == 'administrador':
        # Admin: busca/crea el representante por email
        email_representante = data.get('email_representante', '').strip().lower()
        if not email_representante:
            return jsonify({'success': False, 'message': 'El correo del representante es obligatorio.'}), 400

        rep_user = supabase.table("usuarios").select("id, rol").eq("email", email_representante).execute()
        if rep_user.data:
            rep_id   = rep_user.data[0]['id']
            rol_rep  = rep_user.data[0].get('rol')
            if rol_rep != 'representante':
                return jsonify({'success': False, 'message': 'El correo ya está registrado con un rol diferente.'}), 409
        else:
            # Crear representante vía invitación
            try:
                redirect_url  = os.getenv('SET_PASSWORD_URL', 'https://animated-gnome-3fdf38.netlify.app/set_password.html')
                auth_response = supabase.auth.admin.invite_user_by_email(
                    email_representante,
                    options={"data": {"role": "representante"}, "redirect_to": redirect_url}
                )
                rep_id = auth_response.user.id
                supabase.table("usuarios").insert({
                    "id": rep_id, "email": email_representante,
                    "rol": "representante", "estado": "invitado",
                    "nombres": "", "apellidos": ""
                }).execute()
            except Exception as e:
                print(f"Error al invitar representante: {e}")
                return jsonify({'success': False, 'message': 'No se pudo crear la invitación para el representante.'}), 500
    else:
        # Representante: es él mismo
        rep_id = current_user.id

    # ── Período académico activo ──────────────────────────────────────────────
    periodo_id = None
    try:
        p_res = supabase.table("periodos_academicos").select("id").eq("estado", "activo").execute()
        if p_res.data:
            periodo_id = p_res.data[0]['id']
        else:
            p_res2 = supabase.table("periodos_academicos").select("id").eq("estado", "planificacion") \
                        .order("created_at", desc=True).limit(1).execute()
            if p_res2.data:
                periodo_id = p_res2.data[0]['id']
    except Exception as e:
        print(f"⚠️ No se pudo obtener período: {e}")

    # ── Generar cédula escolar ────────────────────────────────────────────────
    try:
        fecha_nac_obj = datetime.strptime(fecha_nacimiento, "%Y-%m-%d")
        anio_nac      = str(fecha_nac_obj.year)[-2:]
    except ValueError:
        return jsonify({'success': False, 'message': 'Formato de fecha inválido. Use YYYY-MM-DD.'}), 400

    res_hermanos = supabase.table("hijos").select("fecha_nacimiento").eq("representante_id", rep_id).execute()
    mismo_anio   = sum(
        1 for h in (res_hermanos.data or [])
        if h.get('fecha_nacimiento') and
           datetime.strptime(h['fecha_nacimiento'], "%Y-%m-%d").year == fecha_nac_obj.year
    )
    cedula_escolar = f"{mismo_anio + 1}{anio_nac}{ci_rep}"

    # ── Insertar en tabla 'hijos' ─────────────────────────────────────────────
    datos_hijo = {
        "nombre":           nombre,
        "apellidos":        apellidos,
        "fecha_nacimiento": fecha_nacimiento,
        "sexo":             sexo,
        "cedula_escolar":   cedula_escolar,
        "estado_alumno":    "Activo",
        "representante_id": rep_id,
    }
    try:
        res_hijo = supabase.table("hijos").insert(datos_hijo).execute()
        hijo_id  = res_hijo.data[0]['id']
    except Exception as e:
        print(f"❌ Error al insertar hijo: {e}")
        return jsonify({'success': False, 'message': 'Error al guardar los datos del estudiante.'}), 500

    # ── Insertar ficha completa en 'inscripciones' ────────────────────────────
    # Columnas idénticas a las usadas por /api/inscribir (ruta del representante)
    try:
        def _safe_bool(val):
            if isinstance(val, bool): return val
            if isinstance(val, str):  return val.lower() in ('true', '1', 'yes', 'on')
            return bool(val) if val else False

        def _safe_float(val):
            try:    return float(val) if val not in (None, '', '0', 0) else None
            except: return None

        conducta_raw = data.get('conducta', [])
        conducta_list = conducta_raw if isinstance(conducta_raw, list) else []

        datos_inscripcion = {
            "hijo_id":           hijo_id,
            "user_id":           rep_id,
            "periodo_ingreso_id": periodo_id,
            # Ubicación (van aquí, no en hijos)
            "lugar_nacimiento":   lugar_nacimiento,
            "direccion_habitacion": direccion,
            # Familia
            "nombre_madre":    data.get('madre_nombre', ''),
            "ci_madre":        ci_rep,
            "telefono_madre":  data.get('madre_telefono') or None,
            "ocupacion_madre": data.get('madre_ocupacion') or None,
            "nombre_padre":    data.get('padre_nombre') or None,
            "telefono_padre":  data.get('padre_telefono') or None,
            "tipo_vivienda":   data.get('vivienda_tipo') or None,
            "tenencia_vivienda": data.get('vivienda_tenencia') or None,
            # Salud
            "fue_cesarea":       _safe_bool(data.get('bio_cesarea')),
            "es_prematuro":      _safe_bool(data.get('bio_prematuro')),
            "es_alergico":       _safe_bool(data.get('bio_alergico')),
            "peso_nacer":        _safe_float(data.get('bio_peso')),
            "talla_nacer":       _safe_float(data.get('bio_talla')),
            "enfermedad_cronica": data.get('salud_enfermedad') or None,
            "medicamento_fiebre": data.get('salud_fiebre') or None,
            # Hábitos
            "come_solo":         data.get('habito_come') or None,
            "hora_dormir":       data.get('habito_hora') or None,
            "diagnostico_inicial": conducta_list,
        }
        supabase.table("inscripciones").insert(datos_inscripcion).execute()
        print(f"✅ Ficha de inscripción guardada para hijo {hijo_id} (cédula: {cedula_escolar})")
    except Exception as e:
        # No es crítico — el alumno ya fue creado en 'hijos'
        print(f"⚠️ Ficha de inscripción no guardada: {e}")

    # ── Asignar a sección (opcional) ──────────────────────────────────────────
    if seccion_id:
        sec_check = supabase.table("secciones").select("id").eq("id", seccion_id).execute()
        if sec_check.data:
            try:
                supabase.table("asignaciones_estudiantes").insert({
                    "hijo_id":   hijo_id,
                    "seccion_id": seccion_id,
                    "estado":    "cursando"
                }).execute()
                supabase.table("hijos").update({"estado_alumno": "Inscrito"}).eq("id", hijo_id).execute()
            except Exception as e:
                print(f"⚠️ Error al asignar sección: {e}")
                return jsonify({
                    'success': True,
                    'message': f'Estudiante registrado, pero no se pudo asignar a la sección.',
                    'hijo_id': hijo_id,
                    'cedula_escolar': cedula_escolar
                }), 201

    return jsonify({
        'success': True,
        'message': 'Estudiante registrado exitosamente. Se ha enviado invitación al representante.',
        'hijo_id': hijo_id,
        'cedula_escolar': cedula_escolar
    }), 201


@app.route('/api/estudiantes/buscar/<cedula>', methods=['GET'])
@require_auth
def buscar_estudiante_cedula(cedula):
    """Busca un estudiante pre-inscrito por su cédula escolar O cédula de representante."""
    try:
        # 1. Busca hijos que coincidan con la cédula exacta (cedula escolar)
        # O cuya cedula_escolar TERMINE en la cédula buscada (caso de cédula de representante)
        res_ninos = supabase.table("hijos").select("*").ilike("cedula_escolar", f"%{cedula}").execute()
        
        if not res_ninos.data or len(res_ninos.data) == 0:
            return jsonify({'success': False, 'message': 'No se encontró ningún estudiante con esa cédula'}), 404
            
        estudiantes_formateados = []
        
        for nino in res_ninos.data:
            rep_id = nino.get('representante_id')
            rep_nombre = ""
            
            if rep_id:
                res_rep = supabase.table("usuarios").select("nombres, apellidos").eq("id", rep_id).execute()
                if res_rep.data and len(res_rep.data) > 0:
                    rep = res_rep.data[0]
                    rep_nombre = f"{rep.get('nombres', '')} {rep.get('apellidos', '')}".strip()
                    
            estudiantes_formateados.append({
                'id': nino.get('id'),
                'nombres': f"{nino.get('nombre', '')} {nino.get('apellidos', '')}".strip(),
                'cedula_escolar': nino.get('cedula_escolar'),
                'representante': rep_nombre
            })
                
        return jsonify({
            'success': True,
            'estudiantes': estudiantes_formateados
        }), 200

    except Exception as e:
        print(f"❌ Error al buscar estudiante por cédula: {e}")
        return jsonify({'success': False, 'message': 'Error interno en el servidor.'}), 500


@app.route('/api/secciones/disponibles', methods=['GET'])
@require_auth
def obtener_secciones_disponibles():
    """Obtiene las secciones vinculadas al período escolar actual."""
    try:
        # 1. Buscar el período activo o en planificación
        periodo_res = supabase.table("periodos_academicos").select("id").eq("estado", "activo").execute()
        periodo_id = None
        
        if periodo_res.data and len(periodo_res.data) > 0:
            periodo_id = periodo_res.data[0]['id']
        else:
            planificacion_res = supabase.table("periodos_academicos").select("id").eq("estado", "planificacion").order("created_at", desc=True).limit(1).execute()
            if planificacion_res.data and len(planificacion_res.data) > 0:
                periodo_id = planificacion_res.data[0]['id']
                
        if not periodo_id:
            return jsonify({'success': False, 'message': 'No hay un período escolar habilitado para cargar secciones.'}), 404
            
        # 2. Consultar las secciones que pertenecen a este período
        res = supabase.table("secciones").select("id, nivel, letra, capacidad_maxima").eq("periodo_id", periodo_id).execute()
        
        return jsonify({'success': True, 'secciones': res.data}), 200
        
    except Exception as e:
        print(f"❌ Error al obtener secciones: {e}")
        return jsonify({'success': False, 'message': 'Error al cargar secciones.'}), 500


@app.route('/api/estudiantes/asignar', methods=['POST'])
@require_auth
def asignar_estudiante():
    """Matricula al estudiante vinculando su hijo_id con el seccion_id en 'asignaciones_estudiantes'."""
    try:
        data = request.json
        hijo_id = data.get('hijo_id')
        seccion_id = data.get('seccion_id')
        
        if not hijo_id or not seccion_id:
            return jsonify({'success': False, 'message': 'Datos incompletos. Se requiere el estudiante y la sección.'}), 400
            
        # 1. Validar si ya está cursando en alguna sección
        verificacion = supabase.table("asignaciones_estudiantes").select("id").eq("hijo_id", hijo_id).eq("estado", "cursando").execute()
        if len(verificacion.data) > 0:
            return jsonify({'success': False, 'message': 'Este estudiante ya se encuentra cursando en una sección.'}), 409
            
        # 2. Insertar en la nueva tabla
        datos_asignacion = {
            "hijo_id": int(hijo_id),
            "seccion_id": seccion_id,
            "estado": "cursando"
        }
        supabase.table("asignaciones_estudiantes").insert(datos_asignacion).execute()
        
        # Opcional: Podrías actualizar el "estado_alumno" en la tabla hijos
        supabase.table("hijos").update({"estado_alumno": "Inscrito"}).eq("id", hijo_id).execute()
        
        return jsonify({'success': True, 'message': 'Estudiante matriculado y asignado a la sección exitosamente.'}), 201

    except Exception as e:
        print(f"❌ Error al asignar estudiante: {e}")
        return jsonify({'success': False, 'message': 'Error interno al guardar la asignación.'}), 500


@app.route('/api/matricula', methods=['GET'])
@require_auth
def obtener_matricula():
    """Obtiene estudiantes asignados.
    Acepta ?seccion_id=<uuid> para filtrar por aula específica (para el panel de promoción).
    Sin filtro, devuelve todos los activos (comportamiento legacy).
    """
    try:
        seccion_id_filtro = request.args.get('seccion_id')

        if not seccion_id_filtro:
            periodo_res = supabase.table("periodos_academicos") \
                .select("id") \
                .in_("estado", ["activo", "planificacion"]) \
                .order("created_at", desc=True) \
                .limit(1).execute()
            
            if periodo_res.data:
                periodo_actual_id = periodo_res.data[0]['id']
                query = supabase.table("asignaciones_estudiantes") \
                    .select("*, secciones!inner(periodo_id)") \
                    .eq("estado", "cursando") \
                    .eq("secciones.periodo_id", periodo_actual_id)
            else:
                query = supabase.table("asignaciones_estudiantes") \
                    .select("*").eq("estado", "cursando")
        else:
            query = supabase.table("asignaciones_estudiantes").select("*").eq("estado", "cursando").eq("seccion_id", seccion_id_filtro)

        res_asignaciones = query.execute()
        asignaciones = res_asignaciones.data

        matricula_completa = []
        for asig in asignaciones:
            hijo_id = asig.get('hijo_id')
            seccion_id = asig.get('seccion_id')
            
            # Datos base del estudiante
            hijo = None
            if hijo_id:
                res_h = supabase.table("hijos").select("cedula_escolar, nombre, apellidos, representante_id").eq("id", hijo_id).execute()
                if res_h.data: hijo = res_h.data[0]
                
            # Datos del representante
            representante_nombre = _nombre_representante(hijo.get('representante_id') if hijo else None)
                    
            # Datos de la sección
            seccion_nombre = "Sin asignar"
            if seccion_id:
                res_s = supabase.table("secciones").select("nivel, letra").eq("id", seccion_id).execute()
                if res_s.data:
                    sec = res_s.data[0]
                    seccion_nombre = f"{sec.get('nivel', '')} - {sec.get('letra', '')}".strip()
                    
            if hijo:
                matricula_completa.append({
                    "id": asig.get("id"),
                    "hijo_id": hijo_id,
                    "cedula": hijo.get("cedula_escolar", "N/A"),
                    "estudiante": f"{hijo.get('nombre', '')} {hijo.get('apellidos', '')}".strip(),
                    "seccion": seccion_nombre,
                    "representante": representante_nombre
                })
                
        return jsonify({'success': True, 'matricula': matricula_completa}), 200

    except Exception as e:
        print(f"❌ Error al consultar la matricula general: {e}")
        return jsonify({'success': False, 'message': 'Error al cargar la matricula.'}), 500

@app.route('/api/historial', methods=['GET'])
@require_auth
def obtener_historial():
    """Obtiene la lista de los estudiantes egresados o retirados según el estado solicitado."""
    estado_filtro = request.args.get('estado', 'retirado') # Por defecto retirado si no se pasa, o culminado/egresado
    try:
        # Obtenemos asignaciones
        response_asig = supabase.table("asignaciones_estudiantes") \
            .select("id, hijo_id, seccion_id, estado") \
            .eq("estado", estado_filtro) \
            .execute()
            
        asignaciones = response_asig.data
        if not asignaciones:
            return jsonify({'success': True, 'historial': []}), 200
            
        # Recolectar IDs
        hijos_ids = [a['hijo_id'] for a in asignaciones if a.get('hijo_id')]
        
        # Consultar hijos
        hijos_map = {}
        if hijos_ids:
            res_h = supabase.table("hijos").select("id, nombre, apellidos, cedula_escolar, representante_id").in_("id", hijos_ids).execute()
            for h in res_h.data:
                hijos_map[h['id']] = h

        historial_completo = []
        for asig in asignaciones:
            hijo_id = asig.get('hijo_id')
            seccion_id = asig.get('seccion_id')
            
            hijo = hijos_map.get(hijo_id)

            representante_nombre = _nombre_representante(hijo.get('representante_id') if hijo else None)






            seccion_nombre = "Desconocida"
            if seccion_id:
                res_s = supabase.table("secciones").select("nivel, letra").eq("id", seccion_id).execute()
                if res_s.data:
                    sec = res_s.data[0]
                    seccion_nombre = f"{sec.get('nivel', '')} - {sec.get('letra', '')}".strip()
                    
            if hijo:
                historial_completo.append({
                    "id": asig.get("id"),
                    "hijo_id": hijo_id,
                    "cedula": hijo.get("cedula_escolar", "N/A"),
                    "estudiante": f"{hijo.get('nombre', '')} {hijo.get('apellidos', '')}".strip(),
                    "seccion": seccion_nombre,
                    "representante": representante_nombre,
                    "estado": asig.get("estado")
                })
                
        return jsonify({'success': True, 'historial': historial_completo}), 200

    except Exception as e:
        print(f"❌ Error al consultar historial estudiantil: {e}")
        return jsonify({'success': False, 'message': 'Error al cargar el historial.'}), 500

@app.route('/api/matricula/<asignacion_id>/retirar', methods=['PUT'])
@require_auth
def retirar_estudiante(asignacion_id):
    """Marca a un estudiante como 'retirado' y le asigna la fecha de retiro de hoy."""
    try:
        # 1. Obtener a qué niño pertenece esta asignación
        res_asig = supabase.table("asignaciones_estudiantes").select("hijo_id").eq("id", asignacion_id).single().execute()
        if not res_asig.data:
            return jsonify({'success': False, 'message': 'Asignación no encontrada.'}), 404
            
        hijo_id = res_asig.data['hijo_id']
        fecha_hoy = datetime.now().strftime('%Y-%m-%d') # Fecha exacta de hoy

        # 2. Actualizar estado en la tabla asignaciones
        supabase.table("asignaciones_estudiantes").update({"estado": "retirado"}).eq("id", asignacion_id).execute()
        
        # 3. ACTUALIZACIÓN CLAVE: Guardar la fecha de retiro y estado en la tabla hijos
        supabase.table("hijos").update({
            "estado_alumno": "Retirado",
            "fecha_retiro": fecha_hoy,
            "motivo_retiro": "Retiro procesado por la directiva" # Motivo por defecto
        }).eq("id", hijo_id).execute()
        
        return jsonify({'success': True, 'message': 'Estudiante retirado de la sección exitosamente.'}), 200

    except Exception as e:
        print(f"❌ Error al retirar estudiante: {e}")
        return jsonify({'success': False, 'message': 'Error interno al cambiar el estado del estudiante.'}), 500

@app.route('/api/promocion', methods=['POST'])
@require_auth
def promover_estudiantes():
    """Promueve, repite o retira estudiantes de forma individual por aula.

    Acepta dos formatos de payload (backward-compatible):

    NUEVO (preferido):
    {
        "seccion_origen_id": "uuid",
        "periodo_origen_id": "uuid",
        "periodo_destino_id": "uuid",
        "acciones": [
            { "hijo_id": "uuid", "accion": "promover"|"repetir"|"retirar", "seccion_destino_id": "uuid|null" }
        ]
    }

    LEGACY (compatibilidad):
    { "hijos_ids": ["uuid", ...], "periodo_origen_id": "uuid", "periodo_destino_id": "uuid" }
    """
    try:
        # 1. Verificar rol administrador
        solicitante_id = request.current_user.id
        perfil = supabase.table("usuarios").select("rol").eq("id", solicitante_id).maybe_single().execute()
        if not perfil.data or perfil.data.get("rol") != "administrador":
            return jsonify({'success': False, 'message': 'Solo administradores pueden realizar esta acción.'}), 403

        data = request.get_json(silent=True) or {}
        periodo_origen_id = data.get('periodo_origen_id')
        periodo_destino_id = data.get('periodo_destino_id')
        seccion_origen_id = data.get('seccion_origen_id') # Asegura cerrar exactamente el aula que se visualiza
        acciones = data.get('acciones')          # Nuevo formato
        hijos_ids = data.get('hijos_ids', [])    # Formato legacy

        # 2. Determinar período origen
        if periodo_origen_id:
            res_periodo = supabase.table("periodos_academicos").select("*").eq("id", periodo_origen_id).maybe_single().execute()
            if not res_periodo.data:
                return jsonify({'success': False, 'message': 'Período origen no encontrado.'}), 404
            periodo_origen = res_periodo.data
        else:
            res_periodo = supabase.table("periodos_academicos").select("*").eq("estado", "activo").maybe_single().execute()
            if not res_periodo.data:
                return jsonify({'success': False, 'message': 'No hay un período activo configurado.'}), 404
            periodo_origen = res_periodo.data
            periodo_origen_id = periodo_origen['id']

        # 3. Determinar período destino
        if periodo_destino_id:
            res_periodo_dest = supabase.table("periodos_academicos").select("*").eq("id", periodo_destino_id).maybe_single().execute()
            if not res_periodo_dest.data:
                return jsonify({'success': False, 'message': 'Período destino no encontrado.'}), 404
            periodo_destino_id = res_periodo_dest.data['id']
        else:
            try:
                años = periodo_origen['nombre'].split('-')
                nuevo_inicio = int(años[0]) + 1
                nuevo_fin = int(años[1]) + 1 if len(años) > 1 else nuevo_inicio + 1
                nombre_destino = f"{nuevo_inicio}-{nuevo_fin}"
                res_exist = supabase.table("periodos_academicos").select("id, nombre").eq("nombre", nombre_destino).maybe_single().execute()
                if res_exist.data:
                    periodo_destino_id = res_exist.data['id']
                else:
                    return jsonify({
                        'success': False,
                        'message': f'No se encontró el siguiente período escolar ({nombre_destino}). Por favor, créalo manualmente en la sección de Períodos Académicos antes de continuar.'
                    }), 400
            except Exception as ex:
                print(f"Error calculando periodo destino: {ex}")
                return jsonify({'success': False, 'message': 'No se pudo determinar el período destino. Por favor selecciónelo manualmente.'}), 400

        jerarquia_niveles = ['MATERNAL', '1ER GRUPO', '2DO GRUPO', '3ER GRUPO']
        resultados = []

        # ────────────────────────────────────────────────────────────────────
        # MODO NUEVO: payload con acciones individuales
        # ────────────────────────────────────────────────────────────────────
        if acciones and isinstance(acciones, list):
            for item in acciones:
                hijo_id = item.get('hijo_id')
                accion = (item.get('accion') or 'promover').lower()
                seccion_destino_id = item.get('seccion_destino_id')

                try:
                    # Buscar asignación activa del alumno
                    query_asig = supabase.table("asignaciones_estudiantes") \
                        .select("id, seccion_id, secciones!inner(nivel, letra, periodo_id)") \
                        .eq("hijo_id", hijo_id) \
                        .in_("estado", ["cursando", None])
                        
                    if seccion_origen_id:
                        # Buscamos ESPECÍFICAMENTE en el aula que el administrador está viendo
                        query_asig = query_asig.eq("seccion_id", seccion_origen_id)
                    else:
                        # Fallback (legacy)
                        query_asig = query_asig.eq("secciones.periodo_id", periodo_origen_id)
                        
                    res_asig = query_asig.limit(1).execute()

                    if not res_asig.data:
                        resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': 'Error: asignación de origen no encontrada.', 'exito': False})
                        continue

                    asig = res_asig.data[0]
                    asig_id = asig['id']
                    nivel_actual = asig['secciones']['nivel']
                    letra_actual = asig['secciones']['letra']

                    # ── RETIRAR ──────────────────────────────────────────
                    if accion == 'retirar':
                        fecha_hoy = datetime.now().strftime('%Y-%m-%d')
                        supabase.table("asignaciones_estudiantes").update({"estado": "retirado"}).eq("id", asig_id).execute()
                        supabase.table("hijos").update({
                            "estado_alumno": "Retirado",
                            "fecha_retiro": fecha_hoy,
                            "motivo_retiro": "Retiro procesado mediante panel de promoción"
                        }).eq("id", hijo_id).execute()
                        resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': 'Retirado exitosamente.', 'exito': True})
                        continue

                    # ── PROMOVER o REPETIR ────────────────────────────────
                    if nivel_actual in jerarquia_niveles:
                        idx = jerarquia_niveles.index(nivel_actual)

                        if accion == 'promover' and idx == len(jerarquia_niveles) - 1:
                            # 3er Grupo → EGRESAR
                            supabase.table("asignaciones_estudiantes").update({"estado": "egresado"}).eq("id", asig_id).execute()
                            supabase.table("hijos").update({"estado_alumno": "Egresado"}).eq("id", hijo_id).execute()
                            resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': 'Egresado exitosamente.', 'exito': True})
                            continue

                        # Calcular nivel destino según la acción
                        nivel_destino = jerarquia_niveles[idx + 1] if accion == 'promover' else nivel_actual

                        # Determinar sección destino
                        dest_id = seccion_destino_id  # Puede venir del frontend
                        if not dest_id:
                            # Auto-buscar: misma letra en el período destino
                            sec_res = supabase.table("secciones").select("id") \
                                .eq("periodo_id", periodo_destino_id) \
                                .eq("nivel", nivel_destino) \
                                .eq("letra", letra_actual).execute()
                            if sec_res.data:
                                dest_id = sec_res.data[0]['id']
                            else:
                                # Cualquier sección del nivel destino
                                sec_res_alt = supabase.table("secciones").select("id") \
                                    .eq("periodo_id", periodo_destino_id) \
                                    .eq("nivel", nivel_destino).limit(1).execute()
                                if sec_res_alt.data:
                                    dest_id = sec_res_alt.data[0]['id']

                        if not dest_id:
                            resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': f'Error: No existe sección para {nivel_destino} en el período destino.', 'exito': False})
                            continue

                        # ── Idempotencia: verificar si ya existe la asignación destino ──────
                        ya_existe = supabase.table("asignaciones_estudiantes") \
                            .select("id") \
                            .eq("hijo_id", hijo_id) \
                            .eq("seccion_id", dest_id) \
                            .execute()

                        if not ya_existe.data:
                            # Crear nueva asignación en período destino
                            supabase.table("asignaciones_estudiantes").insert({
                                "hijo_id": hijo_id,
                                "seccion_id": dest_id,
                                "estado": "cursando"
                            }).execute()
                        else:
                            # Si ya existe (idempotencia), garantizamos que esté activo ("cursando").
                            # Esto soluciona bugs donde quedaron en "promovido" o "retirado" por accidente.
                            id_dest_existente = ya_existe.data[0]['id']
                            supabase.table("asignaciones_estudiantes").update({"estado": "cursando"}).eq("id", id_dest_existente).execute()

                        estado_origen = "promovido" if accion == "promover" else "repetido"
                        # Cerrar la asignación origen
                        supabase.table("asignaciones_estudiantes") \
                            .update({"estado": estado_origen}) \
                            .eq("id", asig_id) \
                            .execute()

                        # Actualizar estado general del alumno
                        supabase.table("hijos").update({"estado_alumno": "Inscrito"}).eq("id", hijo_id).execute()

                        if not ya_existe.data:
                            label = 'Promovido' if accion == 'promover' else 'Repitente asignado'
                            resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': f'{label} → {nivel_destino}', 'exito': True})
                        else:
                            resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': f'Ya se encontraba en {nivel_destino} (Regularizado)', 'exito': True, 'omitido': True})
                    else:
                        resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': f'Error: Nivel {nivel_actual} no reconocido.', 'exito': False})

                except Exception as e_hijo:
                    print(f"Error procesando hijo {hijo_id}: {e_hijo}")
                    resultados.append({'hijo_id': hijo_id, 'accion': accion, 'status': f'Error crítico: {str(e_hijo)}', 'exito': False})

        # ────────────────────────────────────────────────────────────────────
        # MODO LEGACY: hijos_ids[] (todos promueven por defecto)
        # ────────────────────────────────────────────────────────────────────
        else:
            query_asig = supabase.table("asignaciones_estudiantes") \
                .select("id, hijo_id, seccion_id, secciones!inner(nivel, letra, periodo_id)") \
                .eq("secciones.periodo_id", periodo_origen_id) \
                .in_("estado", ["cursando", None])

            if hijos_ids:
                query_asig = query_asig.in_("hijo_id", hijos_ids)

            res_asig = query_asig.execute()
            asignaciones = res_asig.data

            if not asignaciones:
                return jsonify({'success': False, 'message': 'No se encontraron estudiantes para promover en los filtros seleccionados.'}), 404

            for asig in asignaciones:
                try:
                    hijo_id = asig['hijo_id']
                    nivel_actual = asig['secciones']['nivel']
                    letra_actual = asig['secciones']['letra']

                    if nivel_actual in jerarquia_niveles:
                        idx = jerarquia_niveles.index(nivel_actual)
                        if idx == len(jerarquia_niveles) - 1:
                            supabase.table("asignaciones_estudiantes").update({"estado": "egresado"}).eq("id", asig['id']).execute()
                            supabase.table("hijos").update({"estado_alumno": "Egresado"}).eq("id", hijo_id).execute()
                            resultados.append({'hijo_id': hijo_id, 'status': 'egresado', 'exito': True})
                        else:
                            nivel_destino = jerarquia_niveles[idx + 1]
                            sec_res = supabase.table("secciones").select("id") \
                                .eq("periodo_id", periodo_destino_id) \
                                .eq("nivel", nivel_destino) \
                                .eq("letra", letra_actual).execute()
                            seccion_destino_id = sec_res.data[0]['id'] if sec_res.data else None
                            if not seccion_destino_id:
                                sec_alt = supabase.table("secciones").select("id") \
                                    .eq("periodo_id", periodo_destino_id) \
                                    .eq("nivel", nivel_destino).limit(1).execute()
                                if sec_alt.data:
                                    seccion_destino_id = sec_alt.data[0]['id']
                            if not seccion_destino_id:
                                resultados.append({'hijo_id': hijo_id, 'status': f'Error: No existe sección para {nivel_destino}.', 'exito': False})
                                continue
                            supabase.table("asignaciones_estudiantes").insert({"hijo_id": hijo_id, "seccion_id": seccion_destino_id, "estado": "cursando"}).execute()
                            # Cerrar el registro anterior
                            supabase.table("asignaciones_estudiantes").update({"estado": "promovido"}).eq("id", asig['id']).execute()
                            supabase.table("hijos").update({"estado_alumno": "Inscrito"}).eq("id", hijo_id).execute()
                            resultados.append({'hijo_id': hijo_id, 'status': f'Promovido a {nivel_destino}', 'exito': True})
                    else:
                        resultados.append({'hijo_id': hijo_id, 'status': f'Error: Nivel {nivel_actual} no reconocido.', 'exito': False})
                except Exception as e_hijo:
                    print(f"Error procesando hijo {hijo_id}: {e_hijo}")
                    resultados.append({'hijo_id': hijo_id, 'status': f'Error crítico: {str(e_hijo)}', 'exito': False})

        exitos = sum(1 for r in resultados if r['exito'])
        return jsonify({
            'success': True,
            'message': f'Proceso finalizado. Estudiantes procesados: {len(resultados)}. Éxitos: {exitos}.',
            'resultados': resultados
        }), 200

    except Exception as e:
        print(f"❌ Error en promoción: {e}")
        return jsonify({'success': False, 'message': f'Error interno al procesar la promoción: {str(e)}'}), 500


@require_auth
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
@require_auth
def inscribir_estudiante():
    """Procesa el formulario de inscripción y lo divide en las tablas hijos e inscripciones."""
    print("🚀 [BACKEND] Iniciando inscribir_estudiante...")
    try:
        # 1. Validar datos con Pydantic (El frontend sigue enviando el mismo JSON)
        raw_data = request.get_json()
        print("🚀 [BACKEND] JSON recibido.")
        datos = InscripcionSchema(**raw_data)
        print("🚀 [BACKEND] Validacion Pydantic OK.")

        # Usamos SIEMPRE el ID del usuario autenticado
        user_id_real = request.current_user.id
        print("🚀 [BACKEND] Buscando si el usuario ya llenó la ficha...")

        # Verificar que docentes no puedan inscribir directamente (solo representantes y admins)
        perfil_check = supabase.table("usuarios").select("rol").eq("id", user_id_real).single().execute()
        rol_actual = perfil_check.data.get("rol") if perfil_check.data else None
        if rol_actual == 'docente':
            return jsonify({'success': False, 'message': 'Acción no permitida para docentes.'}), 403

        # 2. Verificar si este usuario ya llenó una ficha
        verif = supabase.table("inscripciones").select("id").eq("user_id", user_id_real).execute()
        print("🚀 [BACKEND] Verificación completada.")
        if len(verif.data) > 0:
             return jsonify({"error": "Ya has completado una ficha de inscripción previamente."}), 409

        # 3. BÚSQUEDA INTELIGENTE DEL PERÍODO ACADÉMICO
        # Prioridad 1: Buscar estrictamente el año escolar 'activo'
        periodo_res = supabase.table("periodos_academicos") \
            .select("id") \
            .eq("estado", "activo") \
            .execute()
            
        periodo_id = None
        
        if periodo_res.data and len(periodo_res.data) > 0:
            # Si hay uno activo, usamos ese sin dudarlo
            periodo_id = periodo_res.data[0]['id']
        else:
            # Prioridad 2: Si NO hay activo, buscamos el de 'planificacion' más reciente
            planificacion_res = supabase.table("periodos_academicos") \
                .select("id") \
                .eq("estado", "planificacion") \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()
                
            if planificacion_res.data and len(planificacion_res.data) > 0:
                periodo_id = planificacion_res.data[0]['id']
            else:
                # Prioridad 3 (Seguridad): Si no hay ni activo ni en planificación, bloqueamos la inscripción
                return jsonify({
                    "error": "El proceso de inscripciones está cerrado. No hay un período escolar habilitado en este momento."
                }), 403

        # --- GENERADOR AUTOMÁTICO DE CÉDULA ESCOLAR ---
        # Regla: [Correlativo] + [Año Nacimiento (2 dígitos)] + [Cédula Representante]
        cedula_rep = str(datos.madre_ci) if datos.madre_ci else "00000000"
        fecha_nac = str(datos.nino_fecha_nacimiento)
        
        # 1. Extraer los últimos 2 dígitos del año de nacimiento
        try:
            temp_year = fecha_nac.split('-')[0]
            if len(temp_year) != 4:  # Por si viene DD-MM-YYYY
                temp_year = fecha_nac.split('-')[-1]
            año_2_digits = temp_year[-2:]
        except:
            año_2_digits = "00"
            
        # 2. Correlativo: Contar hijos de este representante nacidos en el MISMO año
        # Consultamos la tabla 'hijos' (ya que allí reposa la fecha de nacimiento real)
        res_hermanos = supabase.table("hijos").select("fecha_nacimiento").eq("representante_id", user_id_real).execute()
        
        conteo_mismo_año = 0
        if res_hermanos.data:
            for hermano in res_hermanos.data:
                f_hermano = str(hermano.get("fecha_nacimiento", ""))
                try:
                    y_hermano = f_hermano.split('-')[0] if len(f_hermano.split('-')[0]) == 4 else f_hermano.split('-')[-1]
                    if y_hermano[-2:] == año_2_digits:
                        conteo_mismo_año += 1
                except:
                    pass
                    
        correlativo = str(conteo_mismo_año + 1)
        
        # 3. Concatenación Final de Cédula Escolar
        cedula_escolar_oficial = f"{correlativo}{año_2_digits}{cedula_rep}"
        print(f"🎓 Cédula Escolar Autogenerada: {cedula_escolar_oficial}")

        # 4. PASO A: Guardar los datos permanentes en la tabla 'hijos'
        datos_hijo = {
            "nombre": datos.nino_nombres,
            "apellidos": datos.nino_apellidos,
            "fecha_nacimiento": datos.nino_fecha_nacimiento,
            "sexo": datos.nino_sexo,
            "cedula_escolar": cedula_escolar_oficial,
            "estado_alumno": "Activo",
            "representante_id": user_id_real 
        }
        res_hijo = supabase.table("hijos").insert(datos_hijo).execute()
        nuevo_hijo_id = res_hijo.data[0]['id'] # Capturamos el ID del niño recién creado

        # 5. PASO B: Guardar la ficha médica/socioeconómica en 'inscripciones'
        # Nota que ya NO enviamos nombres, sexo, etc., porque ya están en 'hijos'
        datos_inscripcion = {
            "hijo_id": nuevo_hijo_id,          # <- Enlace con el niño
            "periodo_ingreso_id": periodo_id,  # <- Enlace con el año escolar
            "user_id": user_id_real,           # <- Enlace con la cuenta del padre
            
            "edad_estudiante": datos.nino_edad,
            "lugar_nacimiento": datos.nino_lugar_nac,
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

        response = supabase.table("inscripciones").insert(datos_inscripcion).execute()
        nuevo_id_inscripcion = response.data[0]['id']
        
        # ---> NUEVO: Activar al representante oficialmente en el sistema <---
        # Solo cuando llega a este punto sabemos que completó todo exitosamente
        supabase.table("usuarios").update({"estado": "activo"}).eq("id", user_id_real).execute()
        print(f"✅ Representante {user_id_real} activado oficialmente tras completar ficha.")
        
        return jsonify({"mensaje": "Inscripción exitosa", "id": nuevo_id_inscripcion}), 201

    except ValidationError as e:
        return jsonify({"error": "Datos inválidos", "detalles": e.errors()}), 422
    
    except Exception as e:
        print(f"❌ Error Servidor: {e}")
        print(traceback.format_exc())  # <-- traza completa para depuración
        return jsonify({"error": str(e) or "Error interno al procesar la inscripción"}), 500





# =======================================================
# REFRESH TOKEN
# =======================================================

@app.route('/api/refresh', methods=['POST'])
def refresh_token():
    """
    Renueva el access_token usando el refresh_token de Supabase.
    El frontend lo llama automáticamente cuando recibe un 401.
    No requiere @require_auth porque el access_token ya está expirado.
    """
    data = request.get_json(silent=True)
    if not data or not data.get('refresh_token'):
        return jsonify({'success': False, 'message': 'refresh_token requerido.'}), 400

    try:
        # Supabase refresca la sesión y devuelve nuevos tokens
        session = supabase_auth.auth.refresh_session(data['refresh_token'])

        if not session or not session.session:
            return jsonify({'success': False, 'message': 'Sesión inválida o expirada.'}), 401

        return jsonify({
            'success': True,
            'token': session.session.access_token,
            'refresh_token': session.session.refresh_token
        }), 200

    except Exception as e:
        print(f"❌ Error al refrescar token: {e}")
        return jsonify({'success': False, 'message': 'No se pudo renovar la sesión. Por favor inicia sesión nuevamente.'}), 401


# =======================================================
# RUTAS DE PERÍODOS ACADÉMICOS
# =======================================================

ESTADOS_VALIDOS = ['planificacion', 'activo', 'finalizado']

class PeriodoSchema(BaseModel):
    nombre: str
    fecha_inicio: str   # formato YYYY-MM-DD
    fecha_fin: str      # formato YYYY-MM-DD
    estado: Optional[str] = 'planificacion'

def _verificar_admin(user_id: str):
    """Helper: retorna True si el usuario es administrador, False si no."""
    perfil = supabase.table("usuarios").select("rol").eq("id", user_id).single().execute()
    return perfil.data and perfil.data.get("rol") == "administrador"

def _verificar_admin_o_docente(user_id: str):
    """Helper: retorna True si el usuario es administrador o docente, False si no."""
    perfil = supabase.table("usuarios").select("rol").eq("id", user_id).single().execute()
    return perfil.data and perfil.data.get("rol") in ["administrador", "docente"]


@app.route('/api/periodos', methods=['GET'])
@require_auth
def listar_periodos():
    """Lista todos los períodos académicos ordenados por fecha de inicio descendente."""
    if not _verificar_admin_o_docente(request.current_user.id):
        return jsonify({'success': False, 'message': 'Acción denegada. Solo personal autorizado.'}), 403
    try:
        response = supabase.table("periodos_academicos") \
            .select("id, nombre, fecha_inicio, fecha_fin, estado, created_at") \
            .order("fecha_inicio", desc=True) \
            .execute()
        return jsonify({'success': True, 'periodos': response.data}), 200
    except Exception as e:
        print(f"❌ Error al listar períodos: {e}")
        return jsonify({'success': False, 'message': 'Error al obtener períodos académicos.'}), 500


@app.route('/api/periodos', methods=['POST'])
@require_auth
def crear_periodo():
    """Crea un nuevo período académico. Solo administradores."""
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    try:
        raw = request.get_json()
        datos = PeriodoSchema(**raw)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Datos inválidos: {e}'}), 400

    # Validar estado
    if datos.estado not in ESTADOS_VALIDOS:
        return jsonify({'success': False,
                        'message': f'Estado inválido. Permitidos: {", ".join(ESTADOS_VALIDOS)}'}), 400

    # Validar fechas (fecha_fin > fecha_inicio — Supabase también lo valida, pero mejor anticipar)
    try:
        from datetime import date
        fi = date.fromisoformat(datos.fecha_inicio)
        ff = date.fromisoformat(datos.fecha_fin)
        if ff <= fi:
            return jsonify({'success': False,
                            'message': 'La fecha de fin debe ser posterior a la fecha de inicio.'}), 400
    except ValueError:
        return jsonify({'success': False, 'message': 'Formato de fecha inválido. Use YYYY-MM-DD.'}), 400

    try:
        response = supabase.table("periodos_academicos").insert({
            "nombre": datos.nombre.strip(),
            "fecha_inicio": datos.fecha_inicio,
            "fecha_fin": datos.fecha_fin,
            "estado": datos.estado
        }).execute()

        return jsonify({'success': True,
                        'message': f'Período "{datos.nombre}" creado correctamente.',
                        'periodo': response.data[0] if response.data else {}}), 201

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error al crear período: {error_msg}")
        if "periodo_nombre_unico" in error_msg or "unique" in error_msg.lower():
            return jsonify({'success': False,
                            'message': f'Ya existe un período con el nombre "{datos.nombre}".'}), 409
        if "fechas_validas" in error_msg:
            return jsonify({'success': False,
                            'message': 'La fecha de fin debe ser posterior a la fecha de inicio.'}), 400
        if "estado_valido" in error_msg:
            return jsonify({'success': False,
                            'message': f'Estado inválido. Permitidos: {", ".join(ESTADOS_VALIDOS)}'}), 400
        return jsonify({'success': False, 'message': 'Error interno al crear el período.'}), 500


@app.route('/api/periodos/<periodo_id>', methods=['PUT'])
@require_auth
def actualizar_periodo(periodo_id):
    """Actualiza nombre, fechas y/o estado de un período. Solo administradores."""
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No se enviaron datos para actualizar.'}), 400

    campos_permitidos = ['nombre', 'fecha_inicio', 'fecha_fin', 'estado']
    datos_update = {k: v for k, v in data.items() if k in campos_permitidos and v is not None}

    if not datos_update:
        return jsonify({'success': False, 'message': 'No hay campos válidos para actualizar.'}), 400

    # Validar estado si viene
    if 'estado' in datos_update and datos_update['estado'] not in ESTADOS_VALIDOS:
        return jsonify({'success': False,
                        'message': f'Estado inválido. Permitidos: {", ".join(ESTADOS_VALIDOS)}'}), 400

    # Validar fechas si vienen ambas
    if 'fecha_inicio' in datos_update and 'fecha_fin' in datos_update:
        try:
            from datetime import date
            fi = date.fromisoformat(datos_update['fecha_inicio'])
            ff = date.fromisoformat(datos_update['fecha_fin'])
            if ff <= fi:
                return jsonify({'success': False,
                                'message': 'La fecha de fin debe ser posterior a la fecha de inicio.'}), 400
        except ValueError:
            return jsonify({'success': False, 'message': 'Formato de fecha inválido. Use YYYY-MM-DD.'}), 400

    try:
        supabase.table("periodos_academicos").update(datos_update).eq("id", periodo_id).execute()
        return jsonify({'success': True, 'message': 'Período actualizado correctamente.'}), 200
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error al actualizar período: {error_msg}")
        if "periodo_nombre_unico" in error_msg or "unique" in error_msg.lower():
            return jsonify({'success': False, 'message': 'Ya existe un período con ese nombre.'}), 409
        if "fechas_validas" in error_msg or "estado_valido" in error_msg:
            return jsonify({'success': False, 'message': 'Datos inválidos (constraint de BD).'}), 400
        return jsonify({'success': False, 'message': 'Error interno al actualizar el período.'}), 500


@app.route('/api/periodos/<periodo_id>', methods=['DELETE'])
@require_auth
def eliminar_periodo(periodo_id):
    """Elimina un período académico. Bloqueado si tiene secciones asociadas."""
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    try:
        # Verificar que no tenga secciones asociadas antes de eliminar
        secciones = supabase.table("secciones") \
            .select("id", count="exact") \
            .eq("periodo_id", periodo_id) \
            .execute()

        if secciones.count and secciones.count > 0:
            return jsonify({
                'success': False,
                'message': f'No se puede eliminar: el período tiene {secciones.count} sección(es) asociada(s). Elimina primero las secciones.'
            }), 409

        supabase.table("periodos_academicos").delete().eq("id", periodo_id).execute()
        return jsonify({'success': True, 'message': 'Período eliminado correctamente.'}), 200

    except Exception as e:
        print(f"❌ Error al eliminar período: {e}")
        return jsonify({'success': False, 'message': 'Error interno al eliminar el período.'}), 500


# =======================================================
# RUTAS DE SECCIONES
# =======================================================

NIVELES_PERMITIDOS = ['MATERNAL', '1ER GRUPO', '2DO GRUPO', '3ER GRUPO']
LETRAS_PERMITIDAS = ['SECCION A', 'SECCION B', 'SECCION C', 'SECCION D', 'SECCION U']

class SeccionSchema(BaseModel):
    periodo_id: str
    nivel: str
    letra: str
    capacidad_maxima: int = 30
    docentes_ids: List[str] = []

@app.route('/api/secciones', methods=['GET'])
@require_auth
def listar_secciones():
    """Obtiene secciones con su período y docente asociado.
    Acepta ?periodo_id=<uuid> para filtrar por un período específico.
    Acepta ?nivel=<nivel> para filtrar adicionalmente por nivel.
    """
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Solo administradores.'}), 403
    try:
        # Filtros opcionales por query params
        periodo_id_filtro = request.args.get('periodo_id')
        nivel_filtro = request.args.get('nivel')

        query = supabase.table("secciones") \
            .select("id, nivel, letra, capacidad_maxima, periodo_id, periodos_academicos(nombre, estado), docentes_secciones(docente_id, usuarios(nombres, apellidos))")

        if periodo_id_filtro:
            query = query.eq("periodo_id", periodo_id_filtro)
        if nivel_filtro:
            query = query.eq("nivel", nivel_filtro.upper())

        response = query.order("nivel").order("letra").execute()

        # Formatear respuesta para el frontend
        secciones = []
        for s in response.data:
            docentes_info = []
            if s.get("docentes_secciones"):
                for doc_sec in s["docentes_secciones"]:
                    if doc_sec.get("usuarios"):
                        docentes_info.append({
                            "id": doc_sec["docente_id"],
                            "nombre_completo": f'{doc_sec["usuarios"]["nombres"]} {doc_sec["usuarios"]["apellidos"]}'
                        })

            periodo_nombre = s["periodos_academicos"]["nombre"] if s.get("periodos_academicos") else "Desconocido"
            periodo_estado = s["periodos_academicos"]["estado"] if s.get("periodos_academicos") else "desconocido"

            # Nombre legible: "Maternal - Sección A" → "Maternal A"
            nivel_display = s["nivel"].title().replace("Er ", "er ").replace("Do ", "do ").replace("1Er", "1er").replace("2Do", "2do").replace("3Er", "3er")
            letra_display = s["letra"].replace("SECCION ", "")
            nombre_display = f"{nivel_display} {letra_display}".strip()

            secciones.append({
                "id": s["id"],
                "nivel": s["nivel"],
                "letra": s["letra"],
                "nombre": nombre_display,
                "capacidad_maxima": s["capacidad_maxima"],
                "periodo_id": s["periodo_id"],
                "periodo_nombre": periodo_nombre,
                "periodo_estado": periodo_estado,
                "docentes": docentes_info
            })

        return jsonify({'success': True, 'secciones': secciones}), 200
    except Exception as e:
        print(f"❌ Error listar_secciones: {e}")
        return jsonify({'success': False, 'message': 'Error interno al obtener secciones.'}), 500


@app.route('/api/secciones', methods=['POST'])
@require_auth
def crear_seccion():
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Solo administradores.'}), 403

    try:
        datos = SeccionSchema(**request.get_json())
    except ValidationError as e:
        return jsonify({'success': False, 'message': f'Datos inválidos: {e}'}), 400

    if datos.nivel not in NIVELES_PERMITIDOS:
        return jsonify({'success': False, 'message': f'Nivel inválido. Permitidos: {NIVELES_PERMITIDOS}'}), 400
    if datos.letra not in LETRAS_PERMITIDAS:
        return jsonify({'success': False, 'message': f'Letra inválida. Permitidos: {LETRAS_PERMITIDAS}'}), 400

    try:
        # Verificar si existe el período
        periodo = supabase.table("periodos_academicos").select("id").eq("id", datos.periodo_id).single().execute()
        if not periodo.data:
            return jsonify({'success': False, 'message': 'Período académico no encontrado.'}), 404

        # 1. Insertar la Sección
        nueva_seccion = {
            "periodo_id": datos.periodo_id,
            "nivel": datos.nivel,
            "letra": datos.letra,
            "capacidad_maxima": datos.capacidad_maxima
        }
        res_seccion = supabase.table("secciones").insert(nueva_seccion).execute()
        seccion_id = res_seccion.data[0]['id']

        # 2. Insertar todos los docentes en docentes_secciones
        if datos.docentes_ids:
            docentes_unicos = list(set([d for d in datos.docentes_ids if d]))
            insert_docentes = []
            
            for d_id in docentes_unicos:
                insert_docentes.append({
                    "seccion_id": seccion_id,
                    "docente_id": d_id,
                    "rol_en_aula": "Titular"
                })
            
            if insert_docentes:
                try:
                    supabase.table("docentes_secciones").insert(insert_docentes).execute()
                except Exception as e:
                    print(f"Advertencia al insertar docentes: {e}")
                    return jsonify({'success': True, 'message': 'Sección creada, pero hubo un problema asignando algunos docentes (¿IDs inválidos?).'}), 201

        return jsonify({'success': True, 'message': 'Sección creada y asignada exitosamente.'}), 201

    except Exception as e:
        err = str(e)
        print(f"❌ Error crear_seccion: {err}")
        if "unique" in err.lower() or "llave duplicada" in err.lower():
             return jsonify({'success': False, 'message': 'Ya existe esta sección para el período seleccionado.'}), 409
        return jsonify({'success': False, 'message': 'Error interno al crear la sección.'}), 500


@app.route('/api/secciones/<seccion_id>', methods=['DELETE'])
@require_auth
def eliminar_seccion(seccion_id):
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Solo administradores.'}), 403
    try:
        # Supabase lo borra en cascada de docentes_secciones si el FK lo permite.
        # Por seguridad y consistencia, borramos manualmente primero de docentes_secciones
        supabase.table("docentes_secciones").delete().eq("seccion_id", seccion_id).execute()
        supabase.table("secciones").delete().eq("id", seccion_id).execute()

        return jsonify({'success': True, 'message': 'Sección eliminada permanentemente.'}), 200
    except Exception as e:
        print(f"❌ Error eliminar_seccion: {e}")
        return jsonify({'success': False, 'message': 'Error al eliminar la sección.'}), 500

@app.route('/api/asistencias/<seccion_id>/<fecha>', methods=['GET'])
@require_auth
def obtener_asistencia_dia(seccion_id, fecha):
    """Obtiene el listado exacto de alumnos activos en esa fecha y sus asistencias."""
    solicitante_id = request.current_user.id
    perfil = supabase.table("usuarios").select("rol").eq("id", solicitante_id).single().execute()
    
    if not perfil.data or perfil.data.get("rol") not in ["docente", "administrador"]:
        return jsonify({'success': False, 'message': 'Acción denegada.'}), 403

    try:
        # 1. Buscar registros de asistencia YA guardados ese día
        res_asist = supabase.table("asistencias").select("*").eq("seccion_id", seccion_id).eq("fecha", fecha).execute()
        asistencias_guardadas = {a['hijo_id']: a for a in res_asist.data}
        
        # 2. EL VIAJE EN EL TIEMPO: Buscar todos los asignados históricamente a la sección
        res_asig = supabase.table("asignaciones_estudiantes").select("created_at, estado, hijo_id, hijos(id, nombre, apellidos, cedula_escolar, fecha_retiro)").eq("seccion_id", seccion_id).execute()
        
        fecha_consulta = datetime.strptime(fecha, "%Y-%m-%d").date()
        estudiantes_del_dia = []
        
        for asig in res_asig.data:
            h = asig.get('hijos')
            if not h: continue
            
            estado_asignacion = asig.get('estado', 'cursando')
            fecha_ingreso = datetime.strptime(asig['created_at'][:10], "%Y-%m-%d").date()
            fecha_retiro = None
            
            if h.get('fecha_retiro'):
                fecha_retiro = datetime.strptime(h['fecha_retiro'], "%Y-%m-%d").date()
            elif estado_asignacion == 'retirado':
                # EL SEGURO: Si el alumno figura como retirado pero alguien olvidó 
                # ponerle la fecha exacta en la BD, usamos la fecha actual como tope.
                # De esta forma ya no seguirá apareciendo como un "fantasma" de hoy en adelante.
                fecha_retiro = datetime.now().date()
                
            # REGLA ESTRICTA DE TIEMPO:
            # - Ingresó a la escuela ANTES o el MISMO DÍA de la fecha consultada.
            # - No se ha retirado, o se retiró DESPUÉS o el MISMO DÍA consultado.
            if fecha_ingreso <= fecha_consulta and (not fecha_retiro or fecha_retiro >= fecha_consulta):
                reg = asistencias_guardadas.get(h['id'], {})
                
                estudiantes_del_dia.append({
                    "id": h['id'],
                    "nombre_completo": f"{h['nombre']} {h['apellidos']}".strip(),
                    "cedula": h.get('cedula_escolar', 'S/N'),
                    "estado_asistencia": reg.get('estado_asistencia', 'ausente'), # por defecto ausente
                    "observacion": reg.get('observacion', '')
                })
        
        # Ordenar alfabéticamente para facilitar la lectura
        estudiantes_del_dia = sorted(estudiantes_del_dia, key=lambda x: x['nombre_completo'])
        
        return jsonify({
            'success': True, 
            'estudiantes': estudiantes_del_dia,
            'ya_registrada': len(res_asist.data) > 0
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener asistencia del día: {e}")
        return jsonify({'success': False, 'message': 'Error al cargar los datos de asistencia.'}), 500


@app.route('/api/asistencias/guardar', methods=['POST'])
@require_auth
def guardar_asistencia():
    """Guarda o actualiza el registro de asistencia diario de una sección."""
    # Verificar que sea docente o admin
    solicitante_id = request.current_user.id
    perfil = supabase.table("usuarios").select("rol").eq("id", solicitante_id).single().execute()
    
    if not perfil.data or perfil.data.get("rol") not in ["docente", "administrador"]:
        return jsonify({'success': False, 'message': 'Acción denegada. Solo docentes pueden registrar asistencia.'}), 403

    data = request.json
    fecha = data.get('fecha')
    seccion_id = data.get('seccion_id')
    lista_asistencia = data.get('estudiantes', []) # Lista de diccionarios

    if not fecha or not seccion_id or not lista_asistencia:
        return jsonify({'success': False, 'message': 'Datos incompletos. Se requiere fecha, sección y lista de alumnos.'}), 400

    # =======================================================
    # NUEVA VALIDACIÓN ESTRICTA DE FECHAS EN EL BACKEND
    # =======================================================
    try:
        # Convertir el string 'YYYY-MM-DD' a un objeto Date de Python
        fecha_obj = datetime.strptime(fecha, '%Y-%m-%d').date()
        hoy = datetime.now().date()
        
        # 1. Bloquear Fechas Futuras
        if fecha_obj > hoy:
            return jsonify({'success': False, 'message': 'Operación rechazada por el servidor: No se puede registrar asistencia en fechas futuras.'}), 400
            
        # 2. Bloquear Fines de Semana (En Python weekday() 5 es Sábado y 6 es Domingo)
        if fecha_obj.weekday() >= 5:
            return jsonify({'success': False, 'message': 'Operación rechazada por el servidor: No se labora los fines de semana.'}), 400
            
    except ValueError:
        return jsonify({'success': False, 'message': 'Formato de fecha inválido. Se esperaba YYYY-MM-DD.'}), 400
    # =======================================================

    try:
        registros_a_guardar = []
        
        for est in lista_asistencia:
            # Si no envían observación, se guarda como None (NULL en BD)
            observacion = est.get('observacion') if est.get('observacion') else None
            
            registro = {
                "hijo_id": est['hijo_id'],
                "seccion_id": seccion_id,
                "fecha": fecha,
                "estado_asistencia": est.get('estado_asistencia', 'ausente'),
                "observacion": observacion,
                "registrado_por": solicitante_id
            }
            registros_a_guardar.append(registro)

        # Usamos upsert. Si ya existe un registro para ese hijo_id en esa fecha, lo actualiza.
        # Si no existe, lo inserta nuevo. Todo en una sola llamada a la BD.
        response = supabase.table("asistencias").upsert(
            registros_a_guardar, 
            on_conflict="hijo_id,fecha" # Clave de la restricción única
        ).execute()

        return jsonify({'success': True, 'message': 'Asistencia guardada exitosamente.'}), 200

    except Exception as e:
        print(f"❌ Error al guardar asistencia: {e}")
        return jsonify({'success': False, 'message': 'Error interno al procesar la asistencia.'}), 500


@app.route('/api/docente/mi-clase', methods=['GET'])
@require_auth
def obtener_mi_clase():
    """Obtiene la sección asignada a la docente logueada y la lista de sus alumnos activos."""
    docente_id = request.current_user.id
    
    try:
        # 1. Buscar el período activo o en planificación más reciente
        res_periodo = supabase.table("periodos_academicos") \
            .select("id") \
            .in_("estado", ["activo", "planificacion"]) \
            .order("created_at", desc=True) \
            .limit(1).execute()
        
        seccion_id = None
        
        if res_periodo.data:
            periodo_id = res_periodo.data[0]['id']
            # Buscar sección asignada al docente en este período
            res_doc_sec = supabase.table("docentes_secciones") \
                .select("seccion_id, secciones!inner(periodo_id)") \
                .eq("docente_id", docente_id) \
                .eq("secciones.periodo_id", periodo_id) \
                .limit(1).execute()
            
            if res_doc_sec.data:
                seccion_id = res_doc_sec.data[0]['seccion_id']
                
        if not seccion_id:
            # Fallback a cualquier sección que tenga asignada
            res_doc_sec = supabase.table("docentes_secciones").select("seccion_id").eq("docente_id", docente_id).execute()
            if not res_doc_sec.data:
                return jsonify({'success': False, 'message': 'No tienes ninguna sección asignada en este momento.'}), 404
            seccion_id = res_doc_sec.data[0]['seccion_id']
        
        # 2. Obtener los detalles de esa sección (Nivel, Letra y Período)
        res_seccion = supabase.table("secciones").select("nivel, letra, periodo_id").eq("id", seccion_id).execute()
        seccion_info = res_seccion.data[0] if res_seccion.data else {'nivel': 'Desconocido', 'letra': '', 'periodo_id': None}
        
        res_user = supabase.table("usuarios").select("nombres, apellidos").eq("id", docente_id).single().execute()
        nombre_docente = "¡Bienvenida!"
        if res_user.data:
            nombre_docente = f"¡Bienvenida, {res_user.data['nombres']}!"

        # Buscar los datos reales del período académico asociado a esta sección
        periodo_nombre = "Sin asignar"
        periodo_estado = "desconocido"
        
        if seccion_info.get('periodo_id'):
            res_periodo = supabase.table("periodos_academicos").select("nombre, estado").eq("id", seccion_info['periodo_id']).execute()
            if res_periodo.data:
                periodo_nombre = res_periodo.data[0].get('nombre', 'Sin asignar')
                periodo_estado = res_periodo.data[0].get('estado', 'desconocido')

        # 3. Buscar los IDs de los estudiantes inscritos ('cursando') en esta sección
        res_asignaciones = supabase.table("asignaciones_estudiantes").select("hijo_id").eq("seccion_id", seccion_id).eq("estado", "cursando").execute()
        
        estudiantes = []
        if res_asignaciones.data:
            hijos_ids = [item['hijo_id'] for item in res_asignaciones.data]
            
            # 4. Traer los datos de los niños, incluyendo cédula y el ID del representante
            res_hijos = supabase.table("hijos").select("id, nombre, apellidos, cedula_escolar, representante_id").in_("id", hijos_ids).order("nombre").execute()
            
            # Buscamos los nombres de los representantes en un solo query para optimizar
            rep_ids = list(set([h['representante_id'] for h in res_hijos.data if h.get('representante_id')]))
            reps_map = {}
            if rep_ids:
                res_reps = supabase.table("usuarios").select("id, nombres, apellidos").in_("id", rep_ids).execute()
                for r in res_reps.data:
                    reps_map[r['id']] = f"{r.get('nombres', '')} {r.get('apellidos', '')}".strip()

            for h in res_hijos.data:
                inicial = h['nombre'][0].upper() if h['nombre'] else 'S'
                rep_nombre = reps_map.get(h.get('representante_id'), "Desconocido")
                
                estudiantes.append({
                    "id": h['id'],
                    "nombre": h['nombre'],
                    "apellido": h['apellidos'],
                    "cedula_escolar": h.get('cedula_escolar', 'S/N'),
                    "representante": rep_nombre,
                    "fotoUrl": f"https://placehold.co/100x100/E0F2FE/0284C7?text={inicial}"
                })
                
        return jsonify({
            'success': True,
            'docente': nombre_docente,
            'periodo': periodo_nombre,
            'periodo_estado': periodo_estado,
            'seccion': {
                'id': seccion_id,
                'nivel': seccion_info.get('nivel'),
                'letra': seccion_info.get('letra')
            },
            'estudiantes': estudiantes
        }), 200

    except Exception as e:
        print(f"❌ Error al cargar clase de docente: {e}")
        return jsonify({'success': False, 'message': 'Error interno al cargar los datos de la clase.'}), 500


@app.route('/api/estudiantes/<int:hijo_id>/ficha', methods=['GET'])
@require_auth
def obtener_ficha_estudiante(hijo_id):
    """Obtiene todos los datos de inscripción y personales de un estudiante."""
    try:
        # 1. Buscar datos básicos del niño
        res_hijo = supabase.table("hijos").select("*").eq("id", hijo_id).single().execute()
        if not res_hijo.data:
            return jsonify({'success': False, 'message': 'Estudiante no encontrado.'}), 404
            
        hijo = res_hijo.data

        # 2. Buscar su ficha médica/socioeconómica
        res_inscripcion = supabase.table("inscripciones").select("*").eq("hijo_id", hijo_id).order("created_at", desc=True).limit(1).execute()
        inscripcion = res_inscripcion.data[0] if res_inscripcion.data else {}

        # 3. Unificamos todo en un solo diccionario para el Frontend
        ficha_completa = {
            # Datos Niño
            "nombres": hijo.get("nombre", ""),
            "apellidos": hijo.get("apellidos", ""),
            "fecha_nacimiento": hijo.get("fecha_nacimiento", ""),
            "sexo": hijo.get("sexo", ""),
            "cedula_escolar": hijo.get("cedula_escolar", ""),
            
            # Datos Inscripción (Padres, Salud, Hábitos)
            "lugar_nacimiento": inscripcion.get("lugar_nacimiento", ""),
            "direccion_habitacion": inscripcion.get("direccion_habitacion", ""),
            "nombre_madre": inscripcion.get("nombre_madre", ""),
            "ci_madre": inscripcion.get("ci_madre", ""),
            "telefono_madre": inscripcion.get("telefono_madre", ""),
            "ocupacion_madre": inscripcion.get("ocupacion_madre", ""),
            "nombre_padre": inscripcion.get("nombre_padre", ""),
            "telefono_padre": inscripcion.get("telefono_padre", ""),
            "tipo_vivienda": inscripcion.get("tipo_vivienda", ""),
            "tenencia_vivienda": inscripcion.get("tenencia_vivienda", ""),
            "fue_cesarea": inscripcion.get("fue_cesarea", False),
            "es_prematuro": inscripcion.get("es_prematuro", False),
            "es_alergico": inscripcion.get("es_alergico", False),
            "peso_nacer": inscripcion.get("peso_nacer", ""),
            "talla_nacer": inscripcion.get("talla_nacer", ""),
            "enfermedad_cronica": inscripcion.get("enfermedad_cronica", ""),
            "medicamento_fiebre": inscripcion.get("medicamento_fiebre", ""),
            "come_solo": inscripcion.get("come_solo", ""),
            "hora_dormir": inscripcion.get("hora_dormir", ""),
            "diagnostico_inicial": inscripcion.get("diagnostico_inicial", [])
        }

        return jsonify({'success': True, 'ficha': ficha_completa}), 200

    except Exception as e:
        print(f"❌ Error al cargar ficha: {e}")
        return jsonify({'success': False, 'message': 'Error al cargar la ficha del estudiante.'}), 500


@app.route('/api/estudiantes/<int:hijo_id>/constancia/<tipo>', methods=['GET'])
@require_auth
def descargar_constancia_word(hijo_id, tipo):
    """Genera un documento Word reemplazando las llaves {{}} de la plantilla."""
    try:
        # 1. Obtener datos del niño
        res_hijo = supabase.table("hijos").select("*").eq("id", hijo_id).single().execute()
        if not res_hijo.data:
            return jsonify({'success': False, 'message': 'Estudiante no encontrado.'}), 404
        hijo = res_hijo.data

        # 2. Obtener datos académicos (Sección y Período)
        nivel_academico, letra_seccion, periodo_nombre = "No asignado", "", "______________"
        res_asig = supabase.table("asignaciones_estudiantes").select("seccion_id").eq("hijo_id", hijo_id).order("created_at", desc=True).limit(1).execute()
        if res_asig.data and res_asig.data[0].get("seccion_id"):
            res_sec = supabase.table("secciones").select("nivel, letra, periodo_id").eq("id", res_asig.data[0]["seccion_id"]).single().execute()
            if res_sec.data:
                nivel_academico = res_sec.data.get("nivel", "")
                letra_seccion = res_sec.data.get("letra", "")
                if res_sec.data.get("periodo_id"):
                    res_per = supabase.table("periodos_academicos").select("nombre").eq("id", res_sec.data.get("periodo_id")).single().execute()
                    if res_per.data:
                        periodo_nombre = res_per.data.get("nombre", "")

        # 3. Formatear Fechas
        meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        hoy = datetime.now()
        
        fecha_nac_str = hijo.get("fecha_nacimiento")
        if fecha_nac_str:
            try:
                f_obj = datetime.strptime(fecha_nac_str, "%Y-%m-%d")
                fecha_nacimiento_formateada = f"{f_obj.day}/{f_obj.month}/{f_obj.year}"
            except Exception:
                fecha_nacimiento_formateada = str(fecha_nac_str)
        else:
            fecha_nacimiento_formateada = "______________"

        # 4. Construir el Diccionario de Contexto (Las llaves que busca el Word)
        context = {
            "nombres_apellidos_estudiante": f"{hijo.get('nombre') or ''} {hijo.get('apellidos') or ''}".strip().upper(),
            "cedula_escolar": hijo.get('cedula_escolar') or '______________',
            "documento_identidad": hijo.get('cedula_escolar') or '______________',
            "municipio_nacimiento": (hijo.get('municipio_nacimiento') or 'ANGOSTURA DEL ORINOCO').upper(),
            "estado_nacimiento": (hijo.get('estado_nacimiento') or 'BOLÍVAR').upper(),
            "fecha_nacimiento": fecha_nacimiento_formateada,
            "grupo_seccion": f"{nivel_academico} {letra_seccion}".strip(),
            "periodo_escolar": periodo_nombre,
            "motivo_retiro": (hijo.get('motivo_retiro') or '_________________').upper(),
            "dia_actual": str(hoy.day),
            "mes_actual": meses[hoy.month - 1],
            "anio_actual": str(hoy.year)
        }

        # 5. Seleccionar la plantilla correcta
        # Ruta absoluta relativa al directorio donde está este archivo .py
        SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
        plantilla_path = os.path.join(SCRIPT_DIR, "plantillas", f"constancia_{tipo}.docx")
        if not os.path.exists(plantilla_path):
            return jsonify({'success': False, 'message': f'La plantilla {tipo} no existe en el servidor como .docx'}), 404

        # 6. Renderizar el Word
        doc = DocxTemplate(plantilla_path)
        doc.render(context)

        # 7. Guardar en memoria y enviar al usuario
        file_stream = io.BytesIO()
        doc.save(file_stream)
        file_stream.seek(0)

        nombre_archivo = f"Constancia_{tipo.capitalize()}_{hijo.get('nombre', 'Estudiante')}.docx"
        
        return send_file(
            file_stream, 
            as_attachment=True, 
            download_name=nombre_archivo,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )

    except Exception as e:
        print(f"❌ Error al generar Word: {e}")
        return jsonify({'success': False, 'message': 'Error interno al generar el documento.'}), 500


@app.route('/api/estudiantes/<int:hijo_id>/ficha', methods=['PUT'])
@require_auth
def actualizar_ficha_estudiante(hijo_id):
    """Permite a la docente o admin actualizar la ficha del estudiante."""
    data = request.json
    try:
        # 1. Separamos los datos que van a la tabla 'hijos'
        datos_hijo = {
            "nombre": data.get("nombres"),
            "apellidos": data.get("apellidos"),
            "fecha_nacimiento": data.get("fecha_nacimiento"),
            "sexo": data.get("sexo")
        }
        supabase.table("hijos").update(datos_hijo).eq("id", hijo_id).execute()

        # 2. Separamos los datos que van a 'inscripciones'
        datos_inscripcion = {
            "lugar_nacimiento": data.get("lugar_nacimiento"),
            "direccion_habitacion": data.get("direccion_habitacion"),
            "nombre_madre": data.get("nombre_madre"),
            "ci_madre": data.get("ci_madre"),
            "telefono_madre": data.get("telefono_madre"),
            "ocupacion_madre": data.get("ocupacion_madre"),
            "nombre_padre": data.get("nombre_padre"),
            "telefono_padre": data.get("telefono_padre"),
            "tipo_vivienda": data.get("tipo_vivienda"),
            "tenencia_vivienda": data.get("tenencia_vivienda"),
            "fue_cesarea": data.get("fue_cesarea", False),
            "es_prematuro": data.get("es_prematuro", False),
            "es_alergico": data.get("es_alergico", False),
            "peso_nacer": data.get("peso_nacer"),
            "talla_nacer": data.get("talla_nacer"),
            "enfermedad_cronica": data.get("enfermedad_cronica"),
            "medicamento_fiebre": data.get("medicamento_fiebre"),
            "come_solo": data.get("come_solo"),
            "hora_dormir": data.get("hora_dormir")
            # Omitimos diagnostico_inicial por simplicidad en esta actualización, o puedes agregarlo
        }
        
        # Buscamos la inscripción más reciente para actualizarla
        res_inscripcion = supabase.table("inscripciones").select("id").eq("hijo_id", hijo_id).order("created_at", desc=True).limit(1).execute()
        if res_inscripcion.data:
            inscripcion_id = res_inscripcion.data[0]['id']
            supabase.table("inscripciones").update(datos_inscripcion).eq("id", inscripcion_id).execute()

        return jsonify({'success': True, 'message': 'Ficha actualizada correctamente.'}), 200

    except Exception as e:
        print(f"❌ Error al actualizar ficha: {e}")
        return jsonify({'success': False, 'message': 'Error al guardar los cambios en la ficha.'}), 500


@app.route('/api/estadistica/mensual', methods=['POST'])
@require_auth
def generar_estadistica_mensual():
    try:
        data = request.json
        seccion_id = data.get('seccion_id')
        mes = int(data.get('mes'))
        anio = int(data.get('anio'))
        dias_habiles = int(data.get('dias_habiles'))
        
        # 1. Definir Fechas del Mes
        fecha_inicio = date(anio, mes, 1)
        # Obtener el último día del mes
        ultimo_dia = calendar.monthrange(anio, mes)[1]
        fecha_fin = date(anio, mes, ultimo_dia)
        
        meses_nombres = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

        # 2. Consultar Datos de la Sección y Docentes
        res_sec = supabase.table("secciones").select("nivel, letra, periodo_id, periodos_academicos(nombre)").eq("id", seccion_id).single().execute()
        seccion_info = res_sec.data
        
        res_doc = supabase.table("docentes_secciones").select("usuarios(nombres, apellidos)").eq("seccion_id", seccion_id).execute()
        nombres_docentes = [f"{d['usuarios']['nombres'].split(' ')[0]} {d['usuarios']['apellidos'].split(' ')[0]}" for d in res_doc.data if d.get('usuarios')]
        docentes_str = " y ".join(nombres_docentes)

        # 3. Consultar Matrícula (Alumnos Asignados) — se hace ANTES que asistencia para
        #    construir el mapa de sexo por hijo_id (evita depender del join hijos(sexo) en asistencias)
        res_mat = supabase.table("asignaciones_estudiantes").select("created_at, estado, hijo_id, hijos(id, nombre, apellidos, fecha_nacimiento, sexo, fecha_retiro)").eq("seccion_id", seccion_id).execute()

        # Mapa de sexo: { hijo_id: 'M' o 'F' }  — usado para clasificar asistencia
        sexo_map = {}
        for asig in res_mat.data:
            h = asig.get('hijos')
            if h and asig.get('hijo_id'):
                sexo_map[asig['hijo_id']] = h.get('sexo', '')

        # 3. Consultar Asistencias del mes — sin join a hijos (usa sexo_map)
        res_asist = supabase.table("asistencias").select("fecha, estado_asistencia, hijo_id").eq("seccion_id", seccion_id).gte("fecha", fecha_inicio.isoformat()).lte("fecha", fecha_fin.isoformat()).execute()
        
        asistencia_diaria = {}
        for a in res_asist.data:
            f_str = a['fecha']
            if f_str not in asistencia_diaria:
                dia_nombre = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][datetime.strptime(f_str, "%Y-%m-%d").weekday()]
                asistencia_diaria[f_str] = {'fecha': f_str[-2:], 'nombre': dia_nombre, 'v': 0, 'h': 0, 't': 0}
            
            if a['estado_asistencia'] == 'presente':
                sexo = sexo_map.get(a.get('hijo_id'), '')
                if sexo == 'M':
                    asistencia_diaria[f_str]['v'] += 1
                elif sexo == 'F':
                    asistencia_diaria[f_str]['h'] += 1
                asistencia_diaria[f_str]['t'] += 1

        dias_asistencia_lista = sorted(list(asistencia_diaria.values()), key=lambda x: x['fecha'])
        dias_trabajados = len(dias_asistencia_lista)

        # Totales y Promedios de Asistencia
        tot_asist_v = sum(d['v'] for d in dias_asistencia_lista)
        tot_asist_h = sum(d['h'] for d in dias_asistencia_lista)
        tot_asist_t = tot_asist_v + tot_asist_h

        # Regla del MPPE: Promedio mensual con redondeo hacia arriba si decimal >= 0.5
        def redondear_mppe(valor):
            return int(valor + 0.5) if valor > 0 else 0

        prom_v = redondear_mppe(tot_asist_v / dias_habiles) if dias_habiles > 0 else 0
        prom_h = redondear_mppe(tot_asist_h / dias_habiles) if dias_habiles > 0 else 0
        prom_t = prom_v + prom_h

        print(f"📊 DEBUG — dias_habiles={dias_habiles} | tot_v={tot_asist_v} tot_h={tot_asist_h} | prom_v={prom_v} prom_h={prom_h} | dias_trabajados={dias_trabajados} | sexo_map={sexo_map}")

        # 4. Procesar Matrícula — variables para Ingresos, Egresos y Cuadre
        ingresos_lista, egresos_lista = [], []
        mat_ini_v, mat_ini_h, mat_fin_v, mat_fin_h = 0, 0, 0, 0
        ing_v, ing_h, egr_v, egr_h = 0, 0, 0, 0
        
        # Diccionarios para Edades (Maternal, 3, 4, 5, 6)
        edades_v = { 'mat':0, '3':0, '4':0, '5':0, '6':0 }
        edades_h = { 'mat':0, '3':0, '4':0, '5':0, '6':0 }

        def calcular_edad(fecha_nac_str):
            if not fecha_nac_str: return 0
            fn = datetime.strptime(fecha_nac_str, "%Y-%m-%d").date()
            return fecha_fin.year - fn.year - ((fecha_fin.month, fecha_fin.day) < (fn.month, fn.day))

        for asig in res_mat.data:
            h = asig['hijos']
            if not h: continue
            
            sexo = h.get('sexo')
            estado_asig = asig.get('estado', 'cursando')  # 'cursando' o 'retirado'
            fecha_ingreso = datetime.strptime(asig['created_at'][:10], "%Y-%m-%d").date()
            
            # Fecha de retiro: priorizar hijos.fecha_retiro; si no, usar estado de asignación
            # Si estado='retirado' pero no hay fecha_retiro, usamos fecha_fin como aproximación
            fecha_retiro = None
            if h.get('fecha_retiro'):
                fecha_retiro = datetime.strptime(h['fecha_retiro'], "%Y-%m-%d").date()
            elif estado_asig == 'retirado':
                # No sabemos cuándo se retiró exactamente — lo tratamos como retirado en el mes actual
                # Usamos fecha_fin del mes para que NO cuente en matrícula final
                fecha_retiro = fecha_fin

            edad = calcular_edad(h.get('fecha_nacimiento'))
            edad_label = f"{edad} años" if edad > 0 else "Desconocida"
            
            # Estaba inscrito AL INICIO del mes
            if fecha_ingreso < fecha_inicio and (not fecha_retiro or fecha_retiro >= fecha_inicio):
                if sexo == 'M': mat_ini_v += 1
                elif sexo == 'F': mat_ini_h += 1
            
            # Ingresó DURANTE este mes
            if fecha_inicio <= fecha_ingreso <= fecha_fin:
                if sexo == 'M': ing_v += 1
                elif sexo == 'F': ing_h += 1
                ingresos_lista.append({'nombre': f"{h['apellidos']} {h['nombre']}", 'edad': edad_label, 'sexo': sexo})

            # Se retiró DURANTE este mes
            if fecha_retiro and fecha_inicio <= fecha_retiro <= fecha_fin:
                if sexo == 'M': egr_v += 1
                elif sexo == 'F': egr_h += 1
                egresos_lista.append({'nombre': f"{h['apellidos']} {h['nombre']}", 'edad': edad_label, 'sexo': sexo})

            # Activo AL FINAL del mes (Matrícula Final): ingresó antes del fin Y no se retiró antes del fin
            es_activo_al_final = fecha_ingreso <= fecha_fin and (not fecha_retiro or fecha_retiro > fecha_fin)
            if es_activo_al_final:
                if sexo == 'M': 
                    mat_fin_v += 1
                    clave = 'mat' if edad < 3 else (str(edad) if edad <= 6 else '6')
                    edades_v[clave] += 1
                elif sexo == 'F': 
                    mat_fin_h += 1
                    clave = 'mat' if edad < 3 else (str(edad) if edad <= 6 else '6')
                    edades_h[clave] += 1

        # =========================================================
        # 5. GENERACIÓN DEL PDF CON REPORTLAB (DISEÑO PREMIUM SAAS COMPRIMIDO)
        # =========================================================
        pdf_buffer = io.BytesIO()
        
        # Márgenes reducidos a 25pt para asegurar que todo quepa en una sola hoja
        doc = SimpleDocTemplate(pdf_buffer, pagesize=portrait(letter), 
                                rightMargin=25, leftMargin=25, topMargin=25, bottomMargin=25)
        elements = []
        styles = getSampleStyleSheet()

        # --- Estilos Personalizados ---
        section_style = ParagraphStyle(
            name='SectionTitle', fontName='Helvetica-Bold', fontSize=10, 
            textColor=colors.HexColor("#0F172A"), spaceBefore=10, spaceAfter=5,
            borderPadding=4, backColor=colors.HexColor("#F1F5F9")
        )

        # --- 1. ENCABEZADO CON LOGO ---
        # Buscamos la imagen subiendo un nivel en la carpeta (../img/cei.png)
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'img', 'cei.png')
        if os.path.exists(logo_path):
            logo = Image(logo_path, width=1.1*inch, height=1.1*inch)
        else:
            logo = Paragraph("") # Fallback de seguridad si no halla la imagen

        # Texto del encabezado con HTML-like tags para diferentes tamaños y colores
        header_text = """
        <para align="center">
            <font size="10" color="#475569"><b>REPÚBLICA BOLIVARIANA DE VENEZUELA</b></font><br/>
            <font size="10" color="#475569"><b>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</b></font><br/>
            <font size="12" color="#1E293B"><b>C.E.I. "LA PARAGUA"</b></font><br/><br/>
            <font size="13" color="#2563EB"><b>ESTADÍSTICA MENSUAL OFICIAL</b></font>
        </para>
        """
        p_header = Paragraph(header_text, styles['Normal'])
        
        # Tabla invisible para estructurar: Logo a la izquierda, texto centrado
        t_header = Table([[logo, p_header, ""]], colWidths=[1.3*inch, 5.0*inch, 1.3*inch])
        t_header.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'CENTER'),
        ]))
        elements.append(t_header)
        elements.append(Spacer(1, 10))

        # --- 2. TABLA DE METADATOS (Banner Info) ---
        meta_data = [
            ["Mes:", meses_nombres[mes].upper(), "Año Escolar:", seccion_info.get("periodos_academicos", {}).get("nombre", "")],
            ["Sección:", f"{seccion_info.get('nivel', '')} {seccion_info.get('letra', '')}", "Días Hábiles:", str(dias_habiles)],
            ["Docentes:", docentes_str.upper(), "Días Trabajados:", str(dias_trabajados)]
        ]
        meta_table = Table(meta_data, colWidths=[0.8*inch, 3.2*inch, 1.2*inch, 2.4*inch])
        meta_table.setStyle(TableStyle([
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'), 
            ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'), 
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#334155")),
            ('TEXTCOLOR', (1,0), (1,-1), colors.HexColor("#0F172A")), 
            ('TEXTCOLOR', (3,0), (3,-1), colors.HexColor("#0F172A")),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 10))

        # --- Función de Estilo Base Comprimido ---
        def get_premium_table_style():
            return TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")), # Cabecera Slate
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8), # Fuente reducida para ahorrar espacio
                ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
                ('TOPPADDING', (0, 0), (-1, 0), 4),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#F8FAFC")),
                ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor("#334155")),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
                ('TOPPADDING', (0, 1), (-1, -1), 3),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ])

        # --- 3. ASISTENCIA DIARIA ---
        elements.append(Paragraph("1. CONTROL DE ASISTENCIA DIARIA", section_style))
        asistencia_data = [["FECHA", "DÍA", "VARONES (V)", "HEMBRAS (H)", "TOTAL"]]
        
        for dia in dias_asistencia_lista:
            asistencia_data.append([dia['fecha'], dia['nombre'], str(dia['v']), str(dia['h']), str(dia['t'])])
            
        asistencia_data.append(["", "TOTAL", str(tot_asist_v), str(tot_asist_h), str(tot_asist_t)])
        asistencia_data.append(["", "PROM. MENSUAL", str(prom_v), str(prom_h), str(prom_t)])

        t_asistencia = Table(asistencia_data, colWidths=[1.2*inch, 1.6*inch, 1.4*inch, 1.4*inch, 1.4*inch])
        style_asis = get_premium_table_style()
        style_asis.add('BACKGROUND', (1, -2), (-1, -1), colors.HexColor("#DBEAFE"))
        style_asis.add('TEXTCOLOR', (1, -2), (-1, -1), colors.HexColor("#1E3A8A"))
        style_asis.add('FONTNAME', (1, -2), (-1, -1), 'Helvetica-Bold')
        t_asistencia.setStyle(style_asis)
        elements.append(t_asistencia)
        elements.append(Spacer(1, 10))

        # =========================================================================
        # SECCIONES COLUMNARES (LADO A LADO) PARA COMPRIMIR EN UNA SOLA PÁGINA
        # =========================================================================

        # --- 4. EGRESOS E INGRESOS (LADO A LADO) ---
        egresos_data = [["N°", "APELLIDO Y NOMBRE", "EDAD", "SEXO"]]
        if not egresos_lista:
            egresos_data.append(["-", "Sin egresos reportados", "-", "-"])
        else:
            for idx, egr in enumerate(egresos_lista):
                egresos_data.append([str(idx+1), egr['nombre'], egr['edad'], egr['sexo']])
        
        t_egresos = Table(egresos_data, colWidths=[0.3*inch, 2.1*inch, 0.7*inch, 0.6*inch])
        t_egresos.setStyle(get_premium_table_style())

        ingresos_data = [["N°", "APELLIDO Y NOMBRE", "EDAD", "SEXO"]]
        if not ingresos_lista:
            ingresos_data.append(["-", "Sin ingresos reportados", "-", "-"])
        else:
            for idx, ing in enumerate(ingresos_lista):
                ingresos_data.append([str(idx+1), ing['nombre'], ing['edad'], ing['sexo']])
        
        t_ingresos = Table(ingresos_data, colWidths=[0.3*inch, 2.1*inch, 0.7*inch, 0.6*inch])
        t_ingresos.setStyle(get_premium_table_style())

        # Envolvemos las tablas en Listas junto con sus títulos para anidarlas
        wrapper_egresos = [Paragraph("2. EGRESOS (RETIRADOS)", section_style), t_egresos]
        wrapper_ingresos = [Paragraph("3. INGRESOS (MATRICULADOS)", section_style), t_ingresos]

        t_row2 = Table([[wrapper_egresos, wrapper_ingresos]], colWidths=[3.8*inch, 3.8*inch])
        t_row2.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
        ]))
        elements.append(t_row2)
        elements.append(Spacer(1, 5))

        # --- 5. RESUMEN Y EDADES (LADO A LADO) ---
        mat_data = [
            ["DESCRIPCIÓN", "V", "H", "T"],
            ["Alumnos para 1ero del mes", str(mat_ini_v), str(mat_ini_h), str(mat_ini_v + mat_ini_h)],
            ["Matriculados en el mes", str(ing_v), str(ing_h), str(ing_v + ing_h)],
            ["Suma", str(mat_ini_v + ing_v), str(mat_ini_h + ing_h), str((mat_ini_v + ing_v) + (mat_ini_h + ing_h))],
            ["Alumnos Retirados", str(egr_v), str(egr_h), str(egr_v + egr_h)],
            ["Alumnos último del mes", str(mat_fin_v), str(mat_fin_h), str(mat_fin_v + mat_fin_h)],
        ]
        t_mat = Table(mat_data, colWidths=[2.2*inch, 0.5*inch, 0.5*inch, 0.5*inch])
        style_mat = get_premium_table_style()
        style_mat.add('ALIGN', (0,1), (0,-1), 'LEFT')
        style_mat.add('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#DBEAFE"))
        style_mat.add('TEXTCOLOR', (0,-1), (-1,-1), colors.HexColor("#1E3A8A"))
        style_mat.add('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold')
        t_mat.setStyle(style_mat)

        edades_data = [
            ["EDAD", "V", "H", "T"],
            ["Maternal", str(edades_v['mat']), str(edades_h['mat']), str(edades_v['mat'] + edades_h['mat'])],
            ["De 3 años", str(edades_v['3']), str(edades_h['3']), str(edades_v['3'] + edades_h['3'])],
            ["De 4 años", str(edades_v['4']), str(edades_h['4']), str(edades_v['4'] + edades_h['4'])],
            ["De 5 años", str(edades_v['5']), str(edades_h['5']), str(edades_v['5'] + edades_h['5'])],
            ["De 6 años", str(edades_v['6']), str(edades_h['6']), str(edades_v['6'] + edades_h['6'])],
            ["TOTAL", str(sum(edades_v.values())), str(sum(edades_h.values())), str(sum(edades_v.values()) + sum(edades_h.values()))],
        ]
        t_edades = Table(edades_data, colWidths=[1.5*inch, 0.7*inch, 0.7*inch, 0.8*inch])
        style_edades = get_premium_table_style()
        style_edades.add('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#DBEAFE"))
        style_edades.add('TEXTCOLOR', (0,-1), (-1,-1), colors.HexColor("#1E3A8A"))
        style_edades.add('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold')
        t_edades.setStyle(style_edades)

        wrapper_mat = [Paragraph("4. RESUMEN DE MATRÍCULA", section_style), t_mat]
        wrapper_edades = [Paragraph("5. DISTRIBUCIÓN POR EDADES", section_style), t_edades]

        t_row3 = Table([[wrapper_mat, wrapper_edades]], colWidths=[3.8*inch, 3.8*inch])
        t_row3.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
        ]))
        elements.append(t_row3)

        # --- CONSTRUIR EL PDF ---
        doc.build(elements)
        pdf_buffer.seek(0)

        nombre_archivo = f"Estadistica_MPPE_{meses_nombres[mes]}_{anio}.pdf"
        
        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name=nombre_archivo,
            mimetype='application/pdf'
        )

    except Exception as e:
        print(f"❌ Error en estadística: {e}")
        return jsonify({'success': False, 'message': 'Error al generar el PDF de estadística.'}), 500

@app.route('/api/admin/estadistica/rango', methods=['POST'])
@app.route('/api/estadistica/rango', methods=['POST'])
@app.route('/api/docente/estadistica/rango', methods=['POST'])
@require_auth
def estadistica_admin_por_rango():
    """Estadísticas por rango de fechas para administrador (escuela) o docente (su aula)."""
    try:
        current_user = request.current_user
        user_data = supabase.table('usuarios').select('rol').eq('id', current_user.id).execute()
        rol = user_data.data[0].get('rol') if user_data.data else None
        
        if rol not in ['administrador', 'docente']:
            return jsonify({'success': False, 'message': 'Acceso no autorizado.'}), 403
        
        data = request.get_json(silent=True) or {}
        
        # Lógica para detectar si es la ruta simplificada del docente
        if request.path == '/api/docente/estadistica/rango':
            modo = 'aula'
            # Buscar la sección asignada a este docente automáticamente
            res_sec = supabase.table("docentes_secciones").select("seccion_id").eq("docente_id", current_user.id).execute()
            if not res_sec.data:
                return jsonify({'success': False, 'message': 'No tienes ninguna sección asignada.'}), 404
            aula_id = res_sec.data[0]['seccion_id']
        else:
            modo = data.get('modo', 'escuela')
            aula_id = data.get('aula_id')
        
        fecha_inicio = data.get('fecha_inicio')
        fecha_fin = data.get('fecha_fin')
        
        if not fecha_inicio or not fecha_fin:
            return jsonify({'success': False, 'message': 'Fechas de inicio y fin son requeridas'}), 400
        
        if modo == 'aula' and not aula_id:
            return jsonify({'success': False, 'message': 'ID de aula es requerido para modo aula'}), 400
        
        # Obtener asistencias según el modo
        if modo == 'escuela':
            # Todas las asistencias en el rango
            asistencias_res = supabase.table("asistencias") \
                .select("fecha, estado_asistencia, seccion_id") \
                .gte("fecha", fecha_inicio) \
                .lte("fecha", fecha_fin) \
                .execute()
            asistencias = asistencias_res.data
        else:
            # Obtener IDs de hijos de esa sección
            hijos_res = supabase.table("asignaciones_estudiantes") \
                .select("hijo_id") \
                .eq("seccion_id", aula_id) \
                .eq("estado", "cursando") \
                .execute()
            hijos_ids = [h['hijo_id'] for h in hijos_res.data]
            
            if not hijos_ids:
                return jsonify({
                    'success': True,
                    'resumen': {'total_estudiantes': 0, 'total_presentes': 0, 'total_ausentes': 0, 'total_registros': 0, 'porcentaje_asistencia': 0},
                    'tendencia': []
                }), 200
            
            asistencias_res = supabase.table("asistencias") \
                .select("fecha, estado_asistencia") \
                .in_("hijo_id", hijos_ids) \
                .gte("fecha", fecha_inicio) \
                .lte("fecha", fecha_fin) \
                .execute()
            asistencias = asistencias_res.data
        
        # Procesar datos
        total_presentes = 0
        total_ausentes = 0
        asistencia_por_fecha = {}
        
        for a in asistencias:
            fecha = a['fecha']
            estado = a['estado_asistencia']
            
            if fecha not in asistencia_por_fecha:
                asistencia_por_fecha[fecha] = {'presentes': 0, 'ausentes': 0}
            
            if estado == 'presente':
                total_presentes += 1
                asistencia_por_fecha[fecha]['presentes'] += 1
            else:
                total_ausentes += 1
                asistencia_por_fecha[fecha]['ausentes'] += 1
        
        total_registros = total_presentes + total_ausentes
        porcentaje_asistencia = round((total_presentes / total_registros) * 100, 1) if total_registros > 0 else 0
        
        # Construir tendencia diaria
        fechas_ordenadas = sorted(asistencia_por_fecha.keys())
        tendencia = []
        for f in fechas_ordenadas:
            f_obj = datetime.strptime(f, "%Y-%m-%d")
            fecha_corta = f"{f_obj.day:02d}/{f_obj.month:02d}"
            tendencia.append({
                'fecha': f,
                'fecha_corta': fecha_corta,
                'presentes': asistencia_por_fecha[f]['presentes'],
                'ausentes': asistencia_por_fecha[f]['ausentes']
            })
        
        # Para el modo escuela, contar estudiantes únicos matriculados en el período activo
        total_estudiantes = 0
        if modo == 'escuela':
            # Obtener período activo o planificación
            periodo_res = supabase.table("periodos_academicos") \
                .select("id") \
                .in_("estado", ["activo", "planificacion"]) \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()
            if periodo_res.data:
                # Contar estudiantes únicos asignados a secciones de ese período
                estudiantes_res = supabase.table("asignaciones_estudiantes") \
                    .select("hijo_id", count="exact") \
                    .eq("estado", "cursando") \
                    .execute()
                total_estudiantes = estudiantes_res.count or 0
        else:
            # modo aula: ya tenemos hijos_ids
            total_estudiantes = len(hijos_ids) if 'hijos_ids' in locals() else 0
        
        # Calcular porcentaje real: presentes / (estudiantes × días con datos)
        # Si el sistema solo registra presentes (no ausentes), el denominador real
        # es total_estudiantes × número_de_días_con_registro
        num_dias_con_datos = len(asistencia_por_fecha)
        if total_estudiantes > 0 and num_dias_con_datos > 0:
            total_esperado = total_estudiantes * num_dias_con_datos
            # total_ausentes calculados como diferencia con lo esperado
            ausentes_reales = total_esperado - total_presentes
            if ausentes_reales < 0:
                ausentes_reales = 0
            total_ausentes = ausentes_reales
            total_registros = total_esperado
            porcentaje_asistencia = round((total_presentes / total_esperado) * 100, 1)
        else:
            # Sin estudiantes registrados o sin días de datos, usar lo que tengamos
            porcentaje_asistencia = round((total_presentes / total_registros) * 100, 1) if total_registros > 0 else 0
        
        return jsonify({
            'success': True,
            'modo': modo,
            'aula_id': aula_id,
            'resumen': {
                'total_estudiantes': total_estudiantes,
                'total_presentes': total_presentes,
                'total_ausentes': total_ausentes,
                'total_registros': total_registros,
                'porcentaje_asistencia': porcentaje_asistencia
            },
            'tendencia': tendencia
        })
        
    except Exception as e:
        print(f"❌ Error en estadística admin por rango: {e}")
        return jsonify({'success': False, 'message': 'Error al generar estadísticas'}), 500



@app.route('/')
def home():

    """Ruta de Health Check para que Render sepa que la API está viva."""
    return jsonify({
        "status": "online", 
        "mensaje": "API del Sistema de Gestión Escolar funcionando correctamente."
    }), 200
@app.route('/api/usuarios/actualizar-password', methods=['PUT'])
@require_auth
def actualizar_password_propia():
    """Permite al usuario autenticado (vía token de recuperación) cambiar su propia clave."""
    data = request.json
    nueva_password = data.get('password')

    if not nueva_password or len(nueva_password) < 6:
        return jsonify({'success': False, 'message': 'La contraseña debe tener al menos 6 caracteres.'}), 400

    try:
        # El decorador @require_auth ya validó el token y puso al usuario en request.current_user
        user_id = request.current_user.id
        
        # Actualizamos la clave en Supabase Auth usando el cliente admin
        supabase.auth.admin.update_user_by_id(
            user_id, 
            {"password": nueva_password}
        )

        return jsonify({'success': True, 'message': 'Contraseña actualizada con éxito.'}), 200

    except Exception as e:
        print(f"❌ Error al actualizar password: {e}")
        return jsonify({'success': False, 'message': 'Error interno al procesar el cambio de clave.'}), 500

# =======================================================
# MÓDULO: ESTADÍSTICAS PARA ADMINISTRADOR
# =======================================================

@app.route('/api/aulas', methods=['GET'])
@require_auth
def obtener_aulas():
    """Obtiene la lista de secciones activas o en planificación con sus docentes asignados."""
    try:
        current_user = request.current_user
        user_id = current_user.id
        
        # Verificar rol administrador
        user_data = supabase.table('usuarios').select('rol').eq('id', user_id).execute()
        if not user_data.data or user_data.data[0].get('rol') != 'administrador':
            return jsonify({'success': False, 'message': 'Acceso no autorizado.'}), 403
        
        # Obtener período activo o en planificación (el más reciente)
        periodo_res = supabase.table("periodos_academicos") \
            .select("id") \
            .in_("estado", ["activo", "planificacion"]) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        
        periodo_id = periodo_res.data[0]['id'] if periodo_res.data else None
        
        # Consultar secciones
        query = supabase.table("secciones").select(
            "id, nivel, letra, capacidad_maxima, periodo_id, "
            "docentes_secciones(docente_id, usuarios(nombres, apellidos))"
        )
        if periodo_id:
            query = query.eq("periodo_id", periodo_id)
        
        secciones_res = query.execute()
        
        aulas = []
        for sec in secciones_res.data:
            docentes_nombres = []
            rel_docentes = sec.get("docentes_secciones")
            if rel_docentes:
                if isinstance(rel_docentes, dict):
                    rel_docentes = [rel_docentes]
                for ds in rel_docentes:
                    if isinstance(ds, dict) and ds.get("usuarios") and isinstance(ds["usuarios"], dict):
                        nombre = f"{ds['usuarios'].get('nombres', '')} {ds['usuarios'].get('apellidos', '')}".strip()
                        if nombre:
                            docentes_nombres.append(nombre)
            
            aulas.append({
                'id': sec['id'],
                'nombre': f"{sec['nivel']} - {sec['letra']}",
                'grado': sec['nivel'],
                'seccion': sec['letra'],
                'docente_nombre': ", ".join(docentes_nombres) if docentes_nombres else "Sin asignar"
            })
        
        return jsonify({'success': True, 'aulas': aulas})
        
    except Exception as e:
        print(f"❌ Error al obtener aulas: {e}")
        return jsonify({'success': False, 'message': 'Error al obtener aulas'}), 500


# =======================================================
# MÓDULO: PROYECTOS DE APRENDIZAJE
# =======================================================



@app.route('/api/proyectos', methods=['POST'])
@require_auth
def crear_proyecto():
    """Crea un nuevo proyecto de aprendizaje para una sección."""
    data = request.get_json(silent=True) or {}

    seccion_id        = data.get('seccion_id', '').strip()
    nombre            = data.get('nombre', '').strip()
    momento_pedagogico = data.get('momento_pedagogico', '').strip()

    if not all([seccion_id, nombre, momento_pedagogico]):
        return jsonify({
            'success': False,
            'message': 'Faltan datos obligatorios: seccion_id, nombre y momento_pedagogico son requeridos.'
        }), 400

    try:
        nuevo_proyecto = {
            'seccion_id':         seccion_id,
            'nombre':             nombre,
            'momento_pedagogico': momento_pedagogico,
            'estado':             'activo'
        }
        res = supabase.table('proyectos_aprendizaje').insert(nuevo_proyecto).execute()

        return jsonify({
            'success': True,
            'message': 'Proyecto de aprendizaje creado exitosamente.',
            'data':    res.data[0] if res.data else None
        }), 201

    except Exception as e:
        print(f"❌ Error al crear proyecto: {e}")
        return jsonify({'success': False, 'message': 'Error interno al crear el proyecto.'}), 500


@app.route('/api/proyectos/<seccion_id>', methods=['GET'])
@require_auth
def obtener_proyectos(seccion_id):
    """Devuelve los proyectos de una sección, con filtro opcional por ?estado=activos|cerrados."""
    estado_param = request.args.get('estado', '').lower()

    try:
        query = supabase.table('proyectos_aprendizaje') \
            .select('*') \
            .eq('seccion_id', seccion_id) \
            .order('created_at', desc=True)

        # Mapear el parámetro de URL al valor real almacenado en BD
        if estado_param == 'activos':
            query = query.eq('estado', 'activo')
        elif estado_param == 'cerrados':
            query = query.eq('estado', 'cerrado')

        res = query.execute()

        return jsonify({
            'success': True,
            'message': 'Proyectos obtenidos correctamente.',
            'data':    res.data
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener proyectos: {e}")
        return jsonify({'success': False, 'message': 'Error interno al obtener los proyectos.'}), 500


@app.route('/api/proyectos/<proyecto_id>/cerrar', methods=['PUT'])
@require_auth
def cerrar_proyecto(proyecto_id):
    """Cambia el estado de un proyecto de aprendizaje a 'cerrado'."""
    try:
        res = supabase.table('proyectos_aprendizaje') \
            .update({'estado': 'cerrado'}) \
            .eq('id', proyecto_id) \
            .execute()

        if not res.data:
            return jsonify({
                'success': False,
                'message': 'No se encontró el proyecto o ya estaba cerrado.'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Proyecto cerrado exitosamente.',
            'data':    res.data[0]
        }), 200

    except Exception as e:
        print(f"❌ Error al cerrar proyecto: {e}")
        return jsonify({'success': False, 'message': 'Error interno al cerrar el proyecto.'}), 500


# =======================================================
# MÓDULO: INDICADORES DEL PROYECTO
# =======================================================

@app.route('/api/indicadores', methods=['POST'])
@require_auth
def crear_indicador():
    """Crea un nuevo indicador asociado a un proyecto de aprendizaje."""
    data = request.get_json(silent=True) or {}

    proyecto_id      = data.get('proyecto_id', '').strip()
    area_aprendizaje = data.get('area_aprendizaje', '').strip()
    descripcion      = data.get('descripcion', '').strip()

    if not all([proyecto_id, area_aprendizaje, descripcion]):
        return jsonify({
            'success': False,
            'message': 'Faltan datos obligatorios: proyecto_id, area_aprendizaje y descripcion son requeridos.'
        }), 400

    try:
        nuevo_indicador = {
            'proyecto_id':      proyecto_id,
            'area_aprendizaje': area_aprendizaje,
            'descripcion':      descripcion
        }
        res = supabase.table('indicadores').insert(nuevo_indicador).execute()

        return jsonify({
            'success': True,
            'message': 'Indicador creado exitosamente.',
            'data':    res.data[0] if res.data else None
        }), 201

    except Exception as e:
        print(f"❌ Error al crear indicador: {e}")
        return jsonify({'success': False, 'message': 'Error interno al crear el indicador.'}), 500


@app.route('/api/indicadores/<proyecto_id>', methods=['GET'])
@require_auth
def obtener_indicadores(proyecto_id):
    """Devuelve todos los indicadores asociados a un proyecto."""
    try:
        res = supabase.table('indicadores') \
            .select('*') \
            .eq('proyecto_id', proyecto_id) \
            .order('created_at', desc=False) \
            .execute()

        return jsonify({
            'success': True,
            'message': 'Indicadores obtenidos correctamente.',
            'data':    res.data
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener indicadores: {e}")
        return jsonify({'success': False, 'message': 'Error interno al obtener los indicadores.'}), 500


@app.route('/api/indicadores/<indicador_id>', methods=['PUT'])
@require_auth
def actualizar_indicador(indicador_id):
    """Actualiza el área de aprendizaje y/o descripción de un indicador."""
    data = request.get_json(silent=True) or {}

    area_aprendizaje = data.get('area_aprendizaje', '').strip()
    descripcion      = data.get('descripcion', '').strip()

    if not area_aprendizaje and not descripcion:
        return jsonify({
            'success': False,
            'message': 'Se debe proporcionar al menos area_aprendizaje o descripcion para actualizar.'
        }), 400

    datos_update = {}
    if area_aprendizaje:
        datos_update['area_aprendizaje'] = area_aprendizaje
    if descripcion:
        datos_update['descripcion'] = descripcion

    try:
        res = supabase.table('indicadores') \
            .update(datos_update) \
            .eq('id', indicador_id) \
            .execute()

        if not res.data:
            return jsonify({
                'success': False,
                'message': 'No se encontró el indicador especificado.'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Indicador actualizado exitosamente.',
            'data':    res.data[0]
        }), 200

    except Exception as e:
        print(f"❌ Error al actualizar indicador: {e}")
        return jsonify({'success': False, 'message': 'Error interno al actualizar el indicador.'}), 500


@app.route('/api/indicadores/<indicador_id>', methods=['DELETE'])
@require_auth
def eliminar_indicador(indicador_id):
    """Elimina un indicador de la base de datos."""
    try:
        res = supabase.table('indicadores') \
            .delete() \
            .eq('id', indicador_id) \
            .execute()

        if not res.data:
            return jsonify({
                'success': False,
                'message': 'No se encontró el indicador especificado o ya fue eliminado.'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Indicador eliminado exitosamente.',
            'data':    None
        }), 200

    except Exception as e:
        print(f"❌ Error al eliminar indicador: {e}")
        return jsonify({'success': False, 'message': 'Error interno al eliminar el indicador.'}), 500


# =======================================================
# MÓDULO: EVALUACIÓN — RUTA MAESTRA DE INDICADORES
# =======================================================

@app.route('/api/evaluacion/indicadores/<seccion_id>/<momento>', methods=['GET'])
@require_auth
def obtener_indicadores_por_momento(seccion_id, momento):
    """
    Ruta maestra de evaluación.
    1. Busca todos los proyectos de la sección para el momento pedagógico dado.
    2. Recoge todos los indicadores de esos proyectos.
    3. Los devuelve agrupados por area_aprendizaje.
    """
    try:
        # ── Paso 1: obtener proyectos de esta sección y momento ──────────────
        res_proyectos = supabase.table('proyectos_aprendizaje') \
            .select('id, nombre') \
            .eq('seccion_id', seccion_id) \
            .eq('momento_pedagogico', str(momento)) \
            .execute()

        if not res_proyectos.data:
            return jsonify({
                'success': True,
                'message': 'No hay proyectos registrados para este momento pedagógico.',
                'data':    {}
            }), 200

        proyectos_ids = [p['id'] for p in res_proyectos.data]

        # Mapa id → nombre para enriquecer la respuesta si se necesita
        mapa_proyectos = {p['id']: p['nombre'] for p in res_proyectos.data}

        # ── Paso 2: obtener todos los indicadores de esos proyectos ──────────
        res_indicadores = supabase.table('indicadores') \
            .select('id, proyecto_id, area_aprendizaje, descripcion') \
            .in_('proyecto_id', proyectos_ids) \
            .order('area_aprendizaje') \
            .execute()

        # ── Paso 3: agrupar por area_aprendizaje ─────────────────────────────
        agrupados = {}
        for ind in (res_indicadores.data or []):
            area = ind['area_aprendizaje']
            if area not in agrupados:
                agrupados[area] = []
            agrupados[area].append({
                'id':              ind['id'],
                'proyecto_id':     ind['proyecto_id'],
                'proyecto_nombre': mapa_proyectos.get(ind['proyecto_id'], ''),
                'descripcion':     ind['descripcion']
            })

        return jsonify({
            'success': True,
            'message': 'Indicadores obtenidos y agrupados correctamente.',
            'data':    agrupados           # { "Lenguaje": [...], "Matemática": [...], ... }
        }), 200

    except Exception as e:
        print(f"❌ Error en ruta maestra de evaluación: {e}")
        return jsonify({'success': False, 'message': 'Error interno al obtener los indicadores de evaluación.'}), 500

@app.route('/api/evaluacion/<hijo_id>/<momento>', methods=['GET'])
@require_auth
def obtener_evaluacion(hijo_id, momento):
    """Obtiene la evaluación existente de un estudiante para un momento."""
    try:
        # 1. Buscar si hay boletin
        res_boletin = supabase.table('boletines') \
            .select('*') \
            .eq('hijo_id', hijo_id) \
            .eq('momento_pedagogico', str(momento)) \
            .execute()
            
        if not res_boletin.data:
            return jsonify({
                'success': True,
                'message': 'Sin evaluación previa.',
                'data': { 'boleta_id': None, 'recomendacion_docente': '', 'logrados': [] }
            }), 200
            
        boletin = res_boletin.data[0]
        boletin_id = boletin['id']
        
        # 2. Buscar indicadores logrados
        res_ind = supabase.table('boletines_indicadores') \
            .select('indicador_id') \
            .eq('boletin_id', boletin_id) \
            .execute()
            
        logrados = [i['indicador_id'] for i in (res_ind.data or [])]
        
        return jsonify({
            'success': True,
            'message': 'Evaluación obtenida.',
            'data': {
                'boletin_id': boletin_id,
                'recomendacion_docente': boletin.get('recomendaciones_docente', ''), # kept as _docente for the frontend JS to map properly
                'logrados': logrados
            }
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener evaluacion: {e}")
        return jsonify({'success': False, 'message': 'Error interno.'}), 500


@app.route('/api/evaluacion', methods=['POST'])
@require_auth
def guardar_evaluacion():
    """Guarda (crea o actualiza) la evaluación de un estudiante."""
    data = request.get_json(silent=True) or {}
    
    hijo_id = data.get('hijo_id')
    momento = data.get('momento')
    recomendacion = data.get('recomendacion', '').strip()
    logrados = data.get('logrados', [])  # lista de IDs
    
    if not hijo_id or not momento:
        return jsonify({'success': False, 'message': 'hijo_id y momento son requeridos.'}), 400
        
    try:
        # 1. Buscar si ya existe el boletin
        res_boletin = supabase.table('boletines').select('id').eq('hijo_id', hijo_id).eq('momento_pedagogico', str(momento)).execute()
        boletin_id = None
        
        if res_boletin.data:
            boletin_id = res_boletin.data[0]['id']
            # Actualizar recomendación
            supabase.table('boletines').update({'recomendaciones_docente': recomendacion}).eq('id', boletin_id).execute()
        else:
            # Buscar seccion_id del hijo
            res_asig = supabase.table('asignaciones_estudiantes').select('seccion_id').eq('hijo_id', hijo_id).eq('estado', 'cursando').execute()
            if not res_asig.data:
                return jsonify({'success': False, 'message': 'El estudiante no tiene una sección activa asignada.'}), 400
            seccion_id = res_asig.data[0]['seccion_id']

            # Crear nuevo boletin
            nuevo_boletin = {
                'hijo_id': hijo_id,
                'seccion_id': seccion_id,
                'momento_pedagogico': str(momento),
                'recomendaciones_docente': recomendacion
            }
            res_nueva = supabase.table('boletines').insert(nuevo_boletin).execute()
            if res_nueva.data:
                boletin_id = res_nueva.data[0]['id']
        
        if not boletin_id:
            return jsonify({'success': False, 'message': 'Fallo al procesar boletín maestro.'}), 500
            
        # 2. Reemplazar indicadores logrados
        supabase.table('boletines_indicadores').delete().eq('boletin_id', boletin_id).execute()
        
        if logrados:
            insert_data = [{'boletin_id': boletin_id, 'indicador_id': i_id} for i_id in logrados]
            supabase.table('boletines_indicadores').insert(insert_data).execute()
            
        return jsonify({
            'success': True,
            'message': 'Evaluación guardada exitosamente.',
            'data': {'boleta_id': boletin_id}
        }), 200

    except Exception as e:
        print(f"❌ Error al guardar evaluacion: {e}")
        return jsonify({'success': False, 'message': 'Error interno al guardar.'}), 500


# =======================================================
# MÓDULO: BANCO DE RECOMENDACIONES
# =======================================================

@app.route('/api/recomendaciones', methods=['POST'])
@require_auth
def crear_recomendacion():
    """Crea una nueva recomendación predefinida para una sección."""
    data = request.get_json(silent=True) or {}

    seccion_id = data.get('seccion_id', '').strip()
    titulo     = data.get('titulo', '').strip()
    texto      = data.get('texto', '').strip()

    if not all([seccion_id, titulo, texto]):
        return jsonify({
            'success': False,
            'message': 'Faltan datos obligatorios: seccion_id, titulo y texto son requeridos.'
        }), 400

    try:
        nueva_recomendacion = {
            'seccion_id': seccion_id,
            'titulo':     titulo,
            'texto':      texto
        }
        res = supabase.table('banco_recomendaciones').insert(nueva_recomendacion).execute()

        return jsonify({
            'success': True,
            'message': 'Recomendación creada exitosamente.',
            'data':    res.data[0] if res.data else None
        }), 201

    except Exception as e:
        print(f"❌ Error al crear recomendación: {e}")
        return jsonify({'success': False, 'message': 'Error interno al crear la recomendación.'}), 500


@app.route('/api/recomendaciones/<seccion_id>', methods=['GET'])
@require_auth
def obtener_recomendaciones(seccion_id):
    """Devuelve todas las recomendaciones predefinidas de una sección."""
    try:
        res = supabase.table('banco_recomendaciones') \
            .select('*') \
            .eq('seccion_id', seccion_id) \
            .order('created_at', desc=False) \
            .execute()

        return jsonify({
            'success': True,
            'message': 'Recomendaciones obtenidas correctamente.',
            'data':    res.data
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener recomendaciones: {e}")
        return jsonify({'success': False, 'message': 'Error interno al obtener las recomendaciones.'}), 500


@app.route('/api/recomendaciones/<recomendacion_id>', methods=['PUT'])
@require_auth
def actualizar_recomendacion(recomendacion_id):
    """Actualiza el título y/o texto de una recomendación existente."""
    data = request.get_json(silent=True) or {}

    titulo = data.get('titulo', '').strip()
    texto  = data.get('texto', '').strip()

    if not titulo and not texto:
        return jsonify({
            'success': False,
            'message': 'Se debe proporcionar al menos titulo o texto para actualizar.'
        }), 400

    datos_update = {}
    if titulo:
        datos_update['titulo'] = titulo
    if texto:
        datos_update['texto'] = texto

    try:
        res = supabase.table('banco_recomendaciones') \
            .update(datos_update) \
            .eq('id', recomendacion_id) \
            .execute()

        if not res.data:
            return jsonify({
                'success': False,
                'message': 'No se encontró la recomendación especificada.'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Recomendación actualizada exitosamente.',
            'data':    res.data[0]
        }), 200

    except Exception as e:
        print(f"❌ Error al actualizar recomendación: {e}")
        return jsonify({'success': False, 'message': 'Error interno al actualizar la recomendación.'}), 500


@app.route('/api/recomendaciones/<recomendacion_id>', methods=['DELETE'])
@require_auth
def eliminar_recomendacion(recomendacion_id):
    """Elimina una recomendación del banco de la sección."""
    try:
        res = supabase.table('banco_recomendaciones') \
            .delete() \
            .eq('id', recomendacion_id) \
            .execute()

        if not res.data:
            return jsonify({
                'success': False,
                'message': 'No se encontró la recomendación especificada o ya fue eliminada.'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Recomendación eliminada exitosamente.',
            'data':    None
        }), 200

    except Exception as e:
        print(f"❌ Error al eliminar recomendación: {e}")
        return jsonify({'success': False, 'message': 'Error interno al eliminar la recomendación.'}), 500


# =======================================================
# MÓDULO: DESCARGA DE BOLETINES EN WORD
# =======================================================

@app.route('/api/boletines/descargar/<hijo_id>/<momento>', methods=['GET'])
@require_auth
def descargar_boletin(hijo_id, momento):
    """Genera y descarga el boletín de evaluación en formato Word (.docx)."""
    try:
        # 1. Obtener datos del estudiante y el representante
        res_hijo = supabase.table("hijos").select("nombre, apellidos, cedula_escolar, representante_id, fecha_nacimiento").eq("id", hijo_id).single().execute()
        
        if not res_hijo.data:
            return jsonify({'success': False, 'message': 'Estudiante no encontrado'}), 404
            
        hijo = res_hijo.data
        nombre_alumno = f"{hijo.get('nombre', '')} {hijo.get('apellidos', '')}".strip()
        cedula = hijo.get('cedula_escolar', 'S/N')

        # --- Procesar Fecha de Nacimiento y Edad ---
        f_nac_raw = hijo.get('fecha_nacimiento')
        fecha_nac_formateada = ""
        edad_valor = ""
        
        if f_nac_raw:
            try:
                # Convertir de string ISO (YYYY-MM-DD) a objeto date
                fecha_dt = datetime.strptime(f_nac_raw, "%Y-%m-%d").date()
                fecha_nac_formateada = fecha_dt.strftime("%d/%m/%Y")
                
                # Calcular edad exacta
                hoy = date.today()
                edad_valor = hoy.year - fecha_dt.year - ((hoy.month, hoy.day) < (fecha_dt.month, fecha_dt.day))
            except Exception as e:
                print(f"⚠️ Error procesando fecha del alumno {hijo_id}: {e}")

        
        representante_nombre = "Desconocido"
        if hijo.get('representante_id'):
            res_rep = supabase.table("usuarios").select("nombres, apellidos").eq("id", hijo['representante_id']).single().execute()
            if res_rep.data:
                representante_nombre = f"{res_rep.data.get('nombres', '')} {res_rep.data.get('apellidos', '')}".strip()

        # 2. Buscar la sección del estudiante
        res_asig = supabase.table("asignaciones_estudiantes") \
            .select("seccion_id, secciones(nivel, letra)") \
            .eq("hijo_id", hijo_id).eq("estado", "cursando").execute()
            
        if not res_asig.data:
            return jsonify({'success': False, 'message': 'El estudiante no está matriculado en ninguna sección activa'}), 404
            
        seccion_id = res_asig.data[0]['seccion_id']
        secciones_data = res_asig.data[0].get('secciones', {})
        grupo_estudiante = secciones_data.get('nivel', '')
        seccion_estudiante = secciones_data.get('letra', '')
        seccion_nombre = f"{grupo_estudiante} - {seccion_estudiante}".strip() if secciones_data else "Desconocida"

        # Buscar las docentes asignadas a esta sección
        docentes_nombres = []
        res_doc_sec = supabase.table("docentes_secciones").select("usuarios(nombres, apellidos)").eq("seccion_id", seccion_id).execute()
        if res_doc_sec.data:
            for d in res_doc_sec.data:
                u = d.get('usuarios')
                if u:
                    docentes_nombres.append(f"{u.get('nombres', '')} {u.get('apellidos', '')}".strip())
        docentes_str = ", ".join(docentes_nombres) if docentes_nombres else "Sin asignar"

        # 3. Obtener el boletín específico y su recomendación
        res_boletin = supabase.table("boletines") \
            .select("id, recomendaciones_docente") \
            .eq("hijo_id", hijo_id).eq("momento_pedagogico", str(momento)).execute()
            
        recomendacion = ""
        boletin_id = None
        if res_boletin.data:
            boletin_id = res_boletin.data[0]['id']
            recomendacion = res_boletin.data[0].get('recomendaciones_docente', '')

        # 4. Obtener indicadores logrados mediante JOIN
        ind_formacion = []
        ind_ambiente = []
        ind_comunicacion = []
        
        if boletin_id:
            res_ind = supabase.table("boletines_indicadores") \
                .select("indicadores(area_aprendizaje, descripcion)") \
                .eq("boletin_id", boletin_id).execute()
                
            if res_ind.data:
                for item in res_ind.data:
                    ind_data = item.get('indicadores')
                    if ind_data:
                        area = ind_data.get('area_aprendizaje', '').lower()
                        desc = ind_data.get('descripcion', '')
                        
                        # Clasificación dinámica basada en palabras clave
                        if 'personal' in area or 'social' in area or 'formación' in area:
                            ind_formacion.append(desc)
                        elif 'ambiente' in area or 'entorno' in area:
                            ind_ambiente.append(desc)
                        elif 'comunicación' in area or 'representación' in area or 'lenguaje' in area:
                            ind_comunicacion.append(desc)

        # =========================================================
        # 5. GENERACIÓN DEL BOLETÍN EN PDF (DISEÑO PREMIUM EQUILIBRADO)
        # =========================================================
        pdf_buffer = io.BytesIO()
        
        # Márgenes equilibrados (30pt) para respiración visual y compresión eficiente
        doc = SimpleDocTemplate(pdf_buffer, pagesize=portrait(letter), 
                                rightMargin=30, leftMargin=30, topMargin=15, bottomMargin=20)
        elements = []
        styles = getSampleStyleSheet()

        # --- Estilos Personalizados (Punto Medio) ---
        section_title_style = ParagraphStyle(
            name='SectionTitle', fontName='Helvetica-Bold', fontSize=10.5, 
            textColor=colors.HexColor("#0F172A"), spaceBefore=8, spaceAfter=4,
            borderPadding=3.5, backColor=colors.HexColor("#E2E8F0")
        )
        area_desc_style = ParagraphStyle(
            name='AreaDesc', fontName='Helvetica-Oblique', fontSize=8.5,
            textColor=colors.HexColor("#475569"), spaceAfter=4, leading=11
        )
        bullet_style = ParagraphStyle(
            name='PremiumBullet', fontName='Helvetica', fontSize=9.5,
            textColor=colors.HexColor("#1E293B"), leftIndent=15, firstLineIndent=-10, 
            spaceBefore=1.5, spaceAfter=3, leading=12
        )
        recom_style = ParagraphStyle(
            name='Recomendacion', fontName='Helvetica', fontSize=9.5,
            textColor=colors.HexColor("#1E3A8A"), leading=13
        )

        # --- 1. ENCABEZADO CON LOGO ---
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'img', 'cei.png')
        if os.path.exists(logo_path):
            logo = Image(logo_path, width=1.05*inch, height=1.05*inch)
        else:
            logo = Paragraph("")

        momento_nombres = {"1": "PRIMER", "2": "SEGUNDO", "3": "TERCER"}
        momento_texto = momento_nombres.get(str(momento), "")

        header_text = f"""
        <para align="center">
            <font size="9" color="#475569"><b>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</b></font><br/>
            <font size="11" color="#1E293B"><b>C.E.I. "LA PARAGUA"</b></font><br/>
            <font size="8" color="#64748B">MUNICIPIO ANGOSTURA DEL ORINOCO - CIUDAD BOLÍVAR - ESTADO BOLÍVAR</font><br/>
            <font size="11.5" color="#2563EB"><b>AVANCES DEL {momento_texto} MOMENTO PEDAGÓGICO</b></font>
        </para>
        """
        p_header = Paragraph(header_text, styles['Normal'])
        
        t_header = Table([[logo, p_header, ""]], colWidths=[1.15*inch, 5.0*inch, 1.15*inch])
        t_header.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'CENTER'),
        ]))
        elements.append(t_header)
        elements.append(Spacer(1, 10)) 

        # --- 2. TARJETA DE DATOS DEL ALUMNO ---
        meta_data = [
            ["Alumno (a):", nombre_alumno, "Cédula:", cedula],
            ["Fecha Nac.:", fecha_nac_formateada, "Edad:", f"{edad_valor} años"],
            ["Docente(s):", docentes_str, "Representante:", representante_nombre],
            ["Grupo/Nivel:", grupo_estudiante, "Sección:", f'"{seccion_estudiante}"']
        ]
        meta_table = Table(meta_data, colWidths=[0.9*inch, 2.95*inch, 0.9*inch, 2.55*inch])
        meta_table.setStyle(TableStyle([
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 8.5),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'), 
            ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'), 
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#334155")),
            ('TEXTCOLOR', (1,0), (1,-1), colors.HexColor("#0F172A")), 
            ('TEXTCOLOR', (3,0), (3,-1), colors.HexColor("#0F172A")),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5), # Un respiro mayor
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 10))

        # --- 3. ÁREAS DE APRENDIZAJE ---
        elements.append(Paragraph("ÁREAS DE APRENDIZAJE:", ParagraphStyle(
            name='AreaTitle', fontName='Helvetica-Bold', fontSize=11, textColor=colors.HexColor("#1E293B"), spaceAfter=6
        )))

        # 3.1 Formación Personal y Social
        elements.append(Paragraph("Formación Personal y Social", section_title_style))
        elements.append(Paragraph("Se refiere a la capacidad del niño de identificarse como persona única, valiosa con características propias, con derecho a un nombre, una familia, una nacionalidad, que reconozcan al sexo al que pertenecen precisando los aspectos comunes y diferentes. Implica la aceptación y aprecio de sí mismo y sus capacidades de resolver conflictos y acuerdos.", area_desc_style))
        if not ind_formacion:
            elements.append(Paragraph("• En proceso de desarrollo para este momento.", bullet_style))
        for ind in ind_formacion:
            elements.append(Paragraph(f"• {ind}", bullet_style))

        # 3.2 Relación entre los componentes del Ambiente
        elements.append(Paragraph("Relación entre los Componentes del Ambiente", section_title_style))
        elements.append(Paragraph("Se refiere a la relación entre el niño y las experiencias de aprendizaje con el medio físico y natural que lo rodea. Supone el descubrimiento de interesantes universos para observar y explorar, a través de acciones que lo conlleven al conocimiento y establecimiento de relaciones espaciales y entre objetos y así generar procesos que lo lleven a noción de número, el cuidado y conservación del entorno natural.", area_desc_style))
        if not ind_ambiente:
            elements.append(Paragraph("• En proceso de desarrollo para este momento.", bullet_style))
        for ind in ind_ambiente:
            elements.append(Paragraph(f"• {ind}", bullet_style))

        # 3.3 Comunicación y Representación
        elements.append(Paragraph("Comunicación y Representación", section_title_style))
        elements.append(Paragraph("Se contempla como mediadora de las demás, es la forma de comunicación que sirven de nexo entre el mundo interior y el exterior del individuo, en ella se articula la comprensión y utilización y las otras formas de representación para canalizar los sentimientos y emociones de los niños con el propósito de convertirlo en una fuente de disfrute, también propicia aprender a comunicarse en contextos múltiples y así establecer relaciones sociales.", area_desc_style))
        if not ind_comunicacion:
            elements.append(Paragraph("• En proceso de desarrollo para este momento.", bullet_style))
        for ind in ind_comunicacion:
            elements.append(Paragraph(f"• {ind}", bullet_style))

        elements.append(Spacer(1, 12))

        # --- 4. RECOMENDACIONES DEL DOCENTE ---
        elements.append(Paragraph("Recomendaciones de la Docente:", section_title_style))
        
        recom_text = recomendacion if recomendacion.strip() else "Sin recomendaciones registradas para este momento."
        
        t_recom = Table([[Paragraph(recom_text, recom_style)]], colWidths=[7.3*inch])
        t_recom.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#DBEAFE")), 
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#BFDBFE")), 
            ('PADDING', (0,0), (-1,-1), 10), # Padding cómodo
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE')
        ]))
        elements.append(t_recom)
        elements.append(Spacer(1, 30)) # Espacio ideal para sello y firma

        # --- 5. FIRMAS ---
        firmas_data = [
            ["___________________________", "___________________________", "___________________________"],
            ["Director(a)", "Sello", "Docente"]
        ]
        t_firmas = Table(firmas_data, colWidths=[2.4*inch, 2.4*inch, 2.4*inch])
        t_firmas.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9.5),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#475569")),
            ('TOPPADDING', (0,1), (-1,1), 4), 
        ]))
        elements.append(t_firmas)

        # --- CONSTRUIR EL PDF ---
        doc.build(elements)
        pdf_buffer.seek(0)

        nombre_descarga = f"Boletin_Momento{momento}_{nombre_alumno.replace(' ', '_')}.pdf"
        
        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name=nombre_descarga,
            mimetype="application/pdf"
        )
        
    except Exception as e:
        print(f"❌ Error al descargar boletín: {e}")
        return jsonify({'success': False, 'message': 'Error interno al generar el boletín docx.'}), 500


# =======================================================
# MÓDULO: DESCARGA FICHA DE INSCRIPCIÓN (PDF)
# =======================================================

@app.route('/api/estudiantes/<int:hijo_id>/ficha/pdf', methods=['GET'])
@require_auth
def descargar_ficha_inscripcion(hijo_id):
    """Genera y descarga la ficha de inscripción en formato PDF."""
    try:
        # 1. Obtener datos personales (hijos)
        res_hijo = supabase.table("hijos").select("*").eq("id", hijo_id).single().execute()
        if not res_hijo.data:
            return jsonify({'success': False, 'message': 'Estudiante no encontrado'}), 404
        hijo = res_hijo.data
        
        # 2. Obtener la inscripción más reciente
        res_inscripcion = supabase.table("inscripciones").select("*").eq("hijo_id", hijo_id).order("created_at", desc=True).limit(1).execute()
        inscripcion = res_inscripcion.data[0] if res_inscripcion.data else {}

        # 3. Obtener Sección actual
        res_asig = supabase.table("asignaciones_estudiantes") \
            .select("seccion_id, secciones(nivel, letra)") \
            .eq("hijo_id", hijo_id).eq("estado", "cursando").execute()
        
        seccion_nombre = "No asignada"
        if res_asig.data:
            sec = res_asig.data[0].get('secciones', {})
            if sec:
                seccion_nombre = f"{sec.get('nivel', '')} - {sec.get('letra', '')}".strip()

        # Datos extraídos
        nombre_alumno = f"{hijo.get('nombre', '')} {hijo.get('apellidos', '')}".strip()
        cedula = hijo.get('cedula_escolar', 'S/N')
        fecha_nac = hijo.get('fecha_nacimiento', '')
        sexo = hijo.get('sexo', '')
        
        lugar_nac = inscripcion.get('lugar_nacimiento', '-') or '-'
        dir_hab = inscripcion.get('direccion_habitacion', '-') or '-'
        n_madre = inscripcion.get('nombre_madre', '-') or '-'
        ci_madre = inscripcion.get('ci_madre', '-') or '-'
        t_madre = inscripcion.get('telefono_madre', '-') or '-'
        oc_madre = inscripcion.get('ocupacion_madre', '-') or '-'
        
        n_padre = inscripcion.get('nombre_padre', '-') or '-'
        t_padre = inscripcion.get('telefono_padre', '-') or '-'
        t_viv = inscripcion.get('tipo_vivienda', '-') or '-'
        ten_viv = inscripcion.get('tenencia_vivienda', '-') or '-'
        
        fue_cesarea = "Sí" if inscripcion.get('fue_cesarea') else "No"
        es_prematuro = "Sí" if inscripcion.get('es_prematuro') else "No"
        es_alergico = "Sí" if inscripcion.get('es_alergico') else "No"
        peso_nacer = str(inscripcion.get('peso_nacer', '-')) or '-'
        talla_nacer = str(inscripcion.get('talla_nacer', '-')) or '-'
        enf_cronica = inscripcion.get('enfermedad_cronica', '-') or '-'
        med_fiebre = inscripcion.get('medicamento_fiebre', '-') or '-'
        come_solo = "Sí" if inscripcion.get('come_solo') else "No"
        hora_dormir = inscripcion.get('hora_dormir', '-') or '-'
        
        diag_list = inscripcion.get('diagnostico_inicial', [])
        # Manejar caso de nulo o string en vez de array
        if isinstance(diag_list, list):
            diagnostico_str = ", ".join(diag_list) if diag_list else "-"
        elif isinstance(diag_list, str):
            diagnostico_str = diag_list
        else:
            diagnostico_str = "-"

        # Cálculo de edad
        edad_valor = "-"
        fecha_nac_formateada = "-"
        if fecha_nac:
            try:
                fecha_dt = datetime.strptime(fecha_nac, "%Y-%m-%d").date()
                fecha_nac_formateada = fecha_dt.strftime("%d/%m/%Y")
                hoy = date.today()
                edad_valor = str(hoy.year - fecha_dt.year - ((hoy.month, hoy.day) < (fecha_dt.month, fecha_dt.day)))
            except:
                pass
        
        # 5. Generar PDF
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=portrait(letter), rightMargin=30, leftMargin=30, topMargin=15, bottomMargin=20)
        elements = []
        styles = getSampleStyleSheet()

        section_title_style = ParagraphStyle(
            name='SectionTitle', fontName='Helvetica-Bold', fontSize=10.5, 
            textColor=colors.HexColor("#0F172A"), spaceBefore=8, spaceAfter=4,
            borderPadding=3.5, backColor=colors.HexColor("#E2E8F0")
        )
        data_style = ParagraphStyle(name='DataStyle', fontName='Helvetica', fontSize=9, textColor=colors.HexColor("#1E293B"))
        bold_style = ParagraphStyle(name='BoldStyle', fontName='Helvetica-Bold', fontSize=9, textColor=colors.HexColor("#0F172A"))

        # Encabezado
        logo_path = os.path.join(os.path.dirname(__file__), '..', 'img', 'cei.png')
        if os.path.exists(logo_path):
            logo = Image(logo_path, width=1.05*inch, height=1.05*inch)
        else:
            logo = Paragraph("")

        header_text = f"""
        <para align="center">
            <font size="9" color="#475569"><b>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</b></font><br/>
            <font size="11" color="#1E293B"><b>C.E.I. "LA PARAGUA"</b></font><br/>
            <font size="8" color="#64748B">MUNICIPIO ANGOSTURA DEL ORINOCO - CIUDAD BOLÍVAR - ESTADO BOLÍVAR</font><br/>
            <font size="11.5" color="#2563EB"><b>FICHA DE INSCRIPCIÓN</b></font>
        </para>
        """
        p_header = Paragraph(header_text, styles['Normal'])
        t_header = Table([[logo, p_header, ""]], colWidths=[1.15*inch, 5.0*inch, 1.15*inch])
        t_header.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'CENTER'),
        ]))
        elements.append(t_header)
        elements.append(Spacer(1, 10))
        
        # Helper function for tables
        def create_data_table(data_matrix):
            t = Table(data_matrix)
            t.setStyle(TableStyle([
                ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
                ('FONTSIZE', (0,0), (-1,-1), 8.5),
                ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#334155")),
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
                ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
                ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ]))
            return t

        # Sección 1: Datos del Estudiante
        elements.append(Paragraph("Datos del Estudiante", section_title_style))
        d_estudiante = [
            [Paragraph("<b>Nombres:</b>", bold_style), Paragraph(hijo.get('nombre', ''), data_style), Paragraph("<b>Apellidos:</b>", bold_style), Paragraph(hijo.get('apellidos', ''), data_style)],
            [Paragraph("<b>Cédula Escolar:</b>", bold_style), Paragraph(cedula, data_style), Paragraph("<b>Sexo:</b>", bold_style), Paragraph(sexo, data_style)],
            [Paragraph("<b>Fecha Nacimiento:</b>", bold_style), Paragraph(fecha_nac_formateada, data_style), Paragraph("<b>Edad:</b>", bold_style), Paragraph(f"{edad_valor} años", data_style)],
            [Paragraph("<b>Lugar de Nacimiento:</b>", bold_style), Paragraph(lugar_nac, data_style), Paragraph("<b>Sección:</b>", bold_style), Paragraph(seccion_nombre, data_style)]
        ]
        t1 = create_data_table(d_estudiante)
        t1._argW[0] = 1.3*inch
        t1._argW[1] = 2.4*inch
        t1._argW[2] = 1.1*inch
        t1._argW[3] = 2.4*inch
        elements.append(t1)
        elements.append(Spacer(1, 8))

        # Sección 2: Datos Familiares y Vivienda
        elements.append(Paragraph("Datos Familiares y de Vivienda", section_title_style))
        d_familia = [
            [Paragraph("<b>Nombre de la Madre:</b>", bold_style), Paragraph(n_madre, data_style), Paragraph("<b>C.I. Madre:</b>", bold_style), Paragraph(ci_madre, data_style)],
            [Paragraph("<b>Teléfono Madre:</b>", bold_style), Paragraph(t_madre, data_style), Paragraph("<b>Ocupación:</b>", bold_style), Paragraph(oc_madre, data_style)],
            [Paragraph("<b>Nombre del Padre:</b>", bold_style), Paragraph(n_padre, data_style), Paragraph("<b>Teléfono Padre:</b>", bold_style), Paragraph(t_padre, data_style)],
            [Paragraph("<b>Dirección Habitación:</b>", bold_style), Paragraph(dir_hab, data_style), "", ""],
            [Paragraph("<b>Tipo de Vivienda:</b>", bold_style), Paragraph(t_viv, data_style), Paragraph("<b>Tenencia:</b>", bold_style), Paragraph(ten_viv, data_style)],
        ]
        t2 = create_data_table(d_familia)
        t2._argW[0] = 1.4*inch
        t2._argW[1] = 2.3*inch
        t2._argW[2] = 1.0*inch
        t2._argW[3] = 2.5*inch
        t2.setStyle(TableStyle([('SPAN', (1,3), (3,3))])) # Span direccion
        elements.append(t2)
        elements.append(Spacer(1, 8))

        # Sección 3: Antecedentes de Salud y Nacimiento
        elements.append(Paragraph("Antecedentes de Salud y Nacimiento", section_title_style))
        d_salud = [
            [Paragraph("<b>Fue Cesárea:</b>", bold_style), Paragraph(fue_cesarea, data_style), Paragraph("<b>Es Prematuro:</b>", bold_style), Paragraph(es_prematuro, data_style)],
            [Paragraph("<b>Peso al Nacer:</b>", bold_style), Paragraph(peso_nacer, data_style), Paragraph("<b>Talla al Nacer:</b>", bold_style), Paragraph(talla_nacer, data_style)],
            [Paragraph("<b>Es Alérgico:</b>", bold_style), Paragraph(es_alergico, data_style), Paragraph("<b>Enf. Crónica:</b>", bold_style), Paragraph(enf_cronica, data_style)],
            [Paragraph("<b>Med. para Fiebre:</b>", bold_style), Paragraph(med_fiebre, data_style), "", ""]
        ]
        t3 = create_data_table(d_salud)
        t3._argW[0] = 1.3*inch
        t3._argW[1] = 2.3*inch
        t3._argW[2] = 1.2*inch
        t3._argW[3] = 2.4*inch
        t3.setStyle(TableStyle([('SPAN', (1,3), (3,3))]))
        elements.append(t3)
        elements.append(Spacer(1, 8))

        # Sección 4: Hábitos y Diagnóstico
        elements.append(Paragraph("Hábitos y Diagnóstico", section_title_style))
        d_habitos = [
            [Paragraph("<b>Come Solo:</b>", bold_style), Paragraph(come_solo, data_style), Paragraph("<b>Hora de Dormir:</b>", bold_style), Paragraph(hora_dormir, data_style)],
            [Paragraph("<b>Diagnóstico Inicial:</b>", bold_style), Paragraph(diagnostico_str, data_style), "", ""]
        ]
        t4 = create_data_table(d_habitos)
        t4._argW[0] = 1.3*inch
        t4._argW[1] = 2.3*inch
        t4._argW[2] = 1.2*inch
        t4._argW[3] = 2.4*inch
        t4.setStyle(TableStyle([('SPAN', (1,1), (3,1))]))
        elements.append(t4)
        elements.append(Spacer(1, 30))

        # Firmas
        firmas_data = [
            ["___________________________", "___________________________", "___________________________"],
            ["Director(a)", "Sello", "Representante"]
        ]
        t_firmas = Table(firmas_data, colWidths=[2.4*inch, 2.4*inch, 2.4*inch])
        t_firmas.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 9.5),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#475569")),
            ('TOPPADDING', (0,1), (-1,1), 4), 
        ]))
        elements.append(t_firmas)

        doc.build(elements)
        pdf_buffer.seek(0)
        
        nombre_descarga = f"Ficha_Inscripcion_{nombre_alumno.replace(' ', '_')}.pdf"
        
        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name=nombre_descarga,
            mimetype="application/pdf"
        )
    except Exception as e:
        print(f"❌ Error al generar ficha: {e}")
        return jsonify({'success': False, 'message': 'Error interno al generar la ficha en PDF.'}), 500


# =======================================================
# MÓDULO: PORTAL DE REPRESENTANTES
# =======================================================

@app.route('/api/representante/perfil', methods=['GET'])
@require_auth
def obtener_perfil_representante():
    """Obtiene los datos del representante logueado y sus hijos asociados."""
    try:
        user = request.current_user
        
        # 1. Obtener datos del representante de la tabla 'usuarios'
        res_rep = supabase.table("usuarios").select("*").eq("id", user.id).execute()
        if not res_rep.data:
            return jsonify({'success': False, 'message': 'Usuario no encontrado en el sistema.'}), 404
            
        rep_data = res_rep.data[0]
        
        # 2. Buscar hijos asociados en la tabla 'hijos'
        res_hijos = supabase.table("hijos").select("*").eq("representante_id", user.id).execute()
        
        hijos_lista = []
        for h in res_hijos.data:
            # Enriquecer con la sección actual si existe
            # Usamos una consulta separada o join para obtener la sección 'cursando'
            res_asig = supabase.table("asignaciones_estudiantes") \
                .select("seccion_id, secciones(nivel, letra)") \
                .eq("hijo_id", h['id']) \
                .eq("estado", "cursando") \
                .execute()
            
            seccion_nombre = "No asignada"
            if res_asig.data:
                # El join con 'secciones' devuelve un objeto anidado
                asig = res_asig.data[0]
                sec = asig.get('secciones', {})
                if sec:
                    seccion_nombre = f"{sec.get('nivel', '')} - {sec.get('letra', '')}"

            hijos_lista.append({
                'id': h['id'],
                'nombres': h['nombre'],
                'apellidos': h['apellidos'],
                'cedula_escolar': h['cedula_escolar'],
                'seccion': seccion_nombre
            })
            
        # 3. Preparar nombres con fallback si están vacíos
        nombres_final = rep_data.get('nombres', '').strip()
        apellidos_final = rep_data.get('apellidos', '').strip()

        if not nombres_final and not apellidos_final:
            fallback = _nombre_representante(user.id)
            if fallback and fallback not in ["Desconocido", "Sin representante"]:
                nombres_final = fallback
                apellidos_final = ""

        return jsonify({
            'success': True,
            'perfil': {
                'id': rep_data['id'],
                'nombres': nombres_final,
                'apellidos': apellidos_final,
                'email': rep_data['email']
            },
            'hijos': hijos_lista
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener perfil representante: {e}")
        return jsonify({'success': False, 'message': 'Error interno en el servidor.'}), 500

@app.route('/api/representante/hijos/<hijo_id>/progreso', methods=['GET'])
@require_auth
def obtener_progreso_hijo(hijo_id):
    """Consulta los indicadores logrados de un hijo para todos los momentos."""
    try:
        user = request.current_user
        
        # 1. Verificación de seguridad: ¿Es este hijo realmente del representante logueado?
        res_check = supabase.table("hijos").select("id").eq("id", hijo_id).eq("representante_id", user.id).execute()
        if not res_check.data:
            return jsonify({'success': False, 'message': 'Acceso denegado o estudiante no encontrado.'}), 403
            
        # 2. Obtener todos los boletines (momentos) del estudiante
        res_boletines = supabase.table("boletines") \
            .select("id, momento_pedagogico, recomendaciones_docente") \
            .eq("hijo_id", hijo_id) \
            .order("momento_pedagogico") \
            .execute()
            
        progreso = []
        
        for bol in res_boletines.data:
            bol_id = bol['id']
            # Obtener indicadores logrados en este boletín, incluyendo la descripción del indicador
            # Nota: indicadores(area_aprendizaje, descripcion) es un join con la tabla 'indicadores'
            res_ind = supabase.table("boletines_indicadores") \
                .select("indicador_id, indicadores(area_aprendizaje, descripcion)") \
                .eq("boletin_id", bol_id) \
                .execute()
                
            indicadores_logrados = []
            for item in res_ind.data:
                ind = item.get('indicadores', {})
                if ind:
                    indicadores_logrados.append({
                        'area': ind.get('area_aprendizaje'),
                        'descripcion': ind.get('descripcion')
                    })
                
            progreso.append({
                'momento': bol['momento_pedagogico'],
                'recomendacion': bol['recomendaciones_docente'],
                'indicadores': indicadores_logrados
            })
            
        return jsonify({
            'success': True,
            'hijo_id': hijo_id,
            'progreso': progreso
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener progreso hijo: {e}")
        return jsonify({'success': False, 'message': 'Error interno en el servidor.'}), 500


@app.route('/api/representante/hijos/<hijo_id>/asistencias', methods=['GET'])
@require_auth
def obtener_asistencias_hijo(hijo_id):
    """Consulta las asistencias mensuales de un hijo particular para el portal familiar."""
    try:
        user = request.current_user
        
        # 1. Verificación de seguridad
        res_check = supabase.table("hijos").select("id").eq("id", hijo_id).eq("representante_id", user.id).execute()
        if not res_check.data:
            return jsonify({'success': False, 'message': 'Acceso denegado o estudiante no encontrado.'}), 403

        fecha_inicio = request.args.get('fecha_inicio')
        fecha_fin = request.args.get('fecha_fin')

        query = supabase.table("asistencias").select("fecha, estado_asistencia").eq("hijo_id", hijo_id)
        if fecha_inicio:
            query = query.gte("fecha", fecha_inicio)
        if fecha_fin:
            query = query.lte("fecha", fecha_fin)
            
        res_asistencias = query.execute()

        return jsonify({
            'success': True,
            'hijo_id': hijo_id,
            'asistencias': res_asistencias.data
        }), 200

    except Exception as e:
        print(f"❌ Error al obtener asistencias hijo: {e}")
        return jsonify({'success': False, 'message': 'Error interno en el servidor.'}), 500


@app.route('/api/representante/perfil', methods=['PUT'])
@require_auth
def actualizar_contacto_representante():
    """Permite al representante actualizar teléfonos y dirección de sus hijos."""
    try:
        user = request.current_user
        data = request.get_json(silent=True) or {}

        hijo_id = data.get('hijo_id')
        if not hijo_id:
            return jsonify({'success': False, 'message': 'Se requiere hijo_id.'}), 400

        # Verificación de seguridad: el hijo debe ser del representante
        res_check = supabase.table("hijos").select("id").eq("id", hijo_id).eq("representante_id", user.id).execute()
        if not res_check.data:
            return jsonify({'success': False, 'message': 'Acceso denegado.'}), 403

        # Actualizar inscripción (teléfonos + dirección)
        datos_actualizados = {}
        if data.get('telefono_madre') is not None:
            datos_actualizados['telefono_madre'] = data.get('telefono_madre')
        if data.get('telefono_padre') is not None:
            datos_actualizados['telefono_padre'] = data.get('telefono_padre')
        if data.get('direccion_habitacion') is not None:
            datos_actualizados['direccion_habitacion'] = data.get('direccion_habitacion')

        if datos_actualizados:
            res_insc = supabase.table("inscripciones").select("id").eq("hijo_id", hijo_id).order("created_at", desc=True).limit(1).execute()
            if res_insc.data:
                supabase.table("inscripciones").update(datos_actualizados).eq("id", res_insc.data[0]['id']).execute()

        return jsonify({'success': True, 'message': 'Datos de contacto actualizados correctamente.'}), 200

    except Exception as e:
        print(f"❌ Error al actualizar contacto representante: {e}")
        return jsonify({'success': False, 'message': 'Error interno en el servidor.'}), 500


@app.route('/api/comunicados', methods=['GET'])
@require_auth
def obtener_comunicados():
    """Retorna la lista de comunicados publicados, ordenados por fecha descendente."""
    try:
        res = supabase.table("comunicados") \
            .select("id, titulo, contenido, prioridad, created_at") \
            .order("created_at", desc=True) \
            .limit(20) \
            .execute()
        return jsonify({'success': True, 'comunicados': res.data}), 200
    except Exception as e:
        print(f"❌ Error al obtener comunicados: {e}")
        # Si la tabla no existe aún devolvemos lista vacía en lugar de un 500
        return jsonify({'success': True, 'comunicados': []}), 200


# =======================================================
# SISTEMA DE RESPALDO EN LA NUBE — GOOGLE DRIVE
# =======================================================

DRIVE_FOLDER_ID = os.getenv('GOOGLE_DRIVE_FOLDER_ID', '')
ENVIRONMENT     = os.getenv('ENVIRONMENT', 'local')  # 'local' o 'production'

def _get_drive_service():
    """Construye y devuelve el cliente autenticado de Google Drive API."""
    sa_json_str = os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON', '')
    if not sa_json_str:
        raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON no está configurado en las variables de entorno.")

    try:
        # Se asegura de manejar si el usuario pegó el JSON con escapes incorrectos
        sa_json_str = sa_json_str.replace('\n', '\\n') if '\n' in sa_json_str and '\\n' not in sa_json_str else sa_json_str
        sa_info = json.loads(sa_json_str)
    except json.JSONDecodeError as e:
        print(f"❌ Error al decodificar GOOGLE_SERVICE_ACCOUNT_JSON: {e}")
        print(f"   Contenido parcial recibido: {sa_json_str[:100]}...")
        raise ValueError(f"El JSON de la Service Account es inválido. Por favor, vuelve a copiar y pegar todo el contenido del archivo JSON original en Render. Error exacto: {e}")

    creds = service_account.Credentials.from_service_account_info(
        sa_info,
        scopes=['https://www.googleapis.com/auth/drive']
    )
    return googleapiclient.discovery.build('drive', 'v3', credentials=creds)


def _run_pg_dump_to_bytes() -> bytes:
    """
    Ejecuta pg_dump apuntando a DATABASE_URL y devuelve el SQL como bytes.
    Funciona en Linux (Render) usando pg_dump del sistema.
    """
    db_url = os.getenv('DATABASE_URL', '')
    if not db_url:
        raise ValueError("DATABASE_URL no está configurada.")

    # pg_dump disponible en el PATH del sistema (Render tiene postgresql-client)
    cmd = ['pg_dump', '--dbname', db_url, '--format=plain', '--no-owner', '--no-acl', '--encoding=UTF8']
    result = subprocess.run(cmd, capture_output=True, timeout=300)

    if result.returncode != 0:
        raise RuntimeError(f"pg_dump falló: {result.stderr.decode('utf-8', errors='replace')}")

    return result.stdout


def _apply_drive_retention(service, folder_id: str, keep_daily: int = 7):
    """
    Aplica política de retención en Drive:
    - Diarios: conserva los últimos 7
    - Semanales: 1 por semana del último mes (4)
    - Mensuales: 1 por mes del último año (12)
    """
    try:
        results = service.files().list(
            q=f"'{folder_id}' in parents and name contains 'cei_backup_' and trashed=false",
            fields="files(id, name, createdTime)",
            orderBy="createdTime desc",
            pageSize=200
        ).execute()
        files = results.get('files', [])

        from datetime import timezone
        ahora = datetime.now(timezone.utc)
        conservar = set()

        # Diarios: 7 más recientes
        for f in files[:keep_daily]:
            conservar.add(f['id'])

        # Semanales y mensuales
        semanas_cubiertas = {}
        meses_cubiertos = {}
        for f in files:
            fecha_str = f.get('createdTime', '')
            if not fecha_str:
                continue
            fecha = datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
            dias_atras = (ahora - fecha).days

            if dias_atras <= 31:
                semana = dias_atras // 7
                if semana not in semanas_cubiertas:
                    semanas_cubiertas[semana] = f['id']
                    conservar.add(f['id'])

            if dias_atras <= 366:
                clave_mes = (fecha.year, fecha.month)
                if clave_mes not in meses_cubiertos:
                    meses_cubiertos[clave_mes] = f['id']
                    conservar.add(f['id'])

        # Eliminar los que no están en conservar
        eliminados = 0
        for f in files:
            if f['id'] not in conservar:
                service.files().delete(fileId=f['id']).execute()
                print(f"🗑️  Drive retención: eliminado {f['name']}")
                eliminados += 1

        print(f"✅ Retención Drive: {len(conservar)} conservados, {eliminados} eliminados.")
    except Exception as e:
        print(f"⚠️  Error en retención Drive: {e}")


def ejecutar_respaldo_drive(tipo: str = 'auto') -> dict:
    """
    Genera el respaldo de la BD y lo sube a Google Drive.
    Devuelve un dict con el resultado para usarlo tanto en el scheduler como en el endpoint manual.
    """
    if not DRIVE_AVAILABLE:
        return {'success': False, 'message': 'Bibliotecas de Google Drive no instaladas.'}

    folder_id = DRIVE_FOLDER_ID
    if not folder_id:
        return {'success': False, 'message': 'GOOGLE_DRIVE_FOLDER_ID no está configurado.'}

    print(f"☁️  Iniciando respaldo Drive ({tipo})...")
    fecha_str = datetime.now().strftime('%Y-%m-%d_%H-%M')
    nombre_archivo = f"cei_backup_{fecha_str}_{tipo}.sql.gz"

    try:
        # 1. Ejecutar pg_dump
        sql_bytes = _run_pg_dump_to_bytes()
        tamanio_sql_kb = round(len(sql_bytes) / 1024, 1)
        print(f"   pg_dump OK: {tamanio_sql_kb} KB")

        # 2. Comprimir con gzip (sin encriptar; el .gz es solo para ahorrar espacio)
        gz_buffer = BytesIO()
        with gzip.GzipFile(fileobj=gz_buffer, mode='wb') as gz:
            gz.write(sql_bytes)
        gz_buffer.seek(0)
        tamanio_gz_kb = round(gz_buffer.getbuffer().nbytes / 1024, 1)
        print(f"   Compresión OK: {tamanio_gz_kb} KB")

        # 3. Subir a Drive
        service = _get_drive_service()
        file_metadata = {
            'name': nombre_archivo,
            'parents': [folder_id],
            'description': f'Respaldo CEI La Paragua — {tipo} — {fecha_str}'
        }
        media = googleapiclient.http.MediaIoBaseUpload(
            gz_buffer,
            mimetype='application/gzip',
            resumable=False
        )
        uploaded = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, size'
        ).execute()
        print(f"   ✅ Subido a Drive: {uploaded.get('name')} (ID: {uploaded.get('id')})")

        # 4. Aplicar retención
        _apply_drive_retention(service, folder_id)

        return {
            'success': True,
            'archivo': nombre_archivo,
            'tamanio_kb': tamanio_gz_kb,
            'drive_id': uploaded.get('id'),
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        print(f"❌ Error en respaldo Drive: {e}")
        traceback.print_exc()
        return {'success': False, 'message': str(e)}


# --- INICIALIZAR APScheduler (solo si las bibliotecas están disponibles) ---
if DRIVE_AVAILABLE and DRIVE_FOLDER_ID:
    _scheduler = BackgroundScheduler(timezone='America/Caracas')  # UTC-4 Venezuela
    # Ejecutar a las 19:00 hora Venezuela todos los días
    _scheduler.add_job(
        func=ejecutar_respaldo_drive,
        trigger=CronTrigger(hour=19, minute=0),
        id='respaldo_drive_diario',
        name='Respaldo Diario Google Drive',
        replace_existing=True,
        kwargs={'tipo': 'auto'}
    )
    _scheduler.start()
    print("✅ APScheduler iniciado: respaldo Drive programado a las 19:00 VE cada día.")
else:
    _scheduler = None
    if not DRIVE_FOLDER_ID:
        print("ℹ️  GOOGLE_DRIVE_FOLDER_ID no configurado — scheduler de Drive desactivado.")


# =======================================================
# ENDPOINTS DE RESPALDO — ADMINISTRADOR
# =======================================================

def _verificar_admin():
    """Helper: Verifica que el usuario actual sea administrador. Lanza excepción si no."""
    user_id = request.current_user.id
    perfil = supabase.table("usuarios").select("rol").eq("id", user_id).single().execute()
    if not perfil.data or perfil.data.get("rol") != "administrador":
        return False
    return True


@app.route('/api/admin/backup-manual', methods=['POST'])
@require_auth
def backup_manual():
    """
    Dispara un respaldo manual.
    - En 'production' (Render): sube directamente a Google Drive.
    - En 'local': ejecuta backup_db.ps1 vía PowerShell.
    Requiere rol administrador.
    """
    if not _verificar_admin():
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    entorno = os.getenv('ENVIRONMENT', 'local')

    if entorno == 'production':
        # ── RENDER: subir a Drive directamente
        resultado = ejecutar_respaldo_drive(tipo='manual')
        if resultado['success']:
            return jsonify({
                'success': True,
                'message': '✅ Respaldo en Drive completado exitosamente.',
                'archivo': resultado.get('archivo'),
                'tamanio_kb': resultado.get('tamanio_kb'),
                'timestamp': resultado.get('timestamp')
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': f"❌ Error al respaldar en Drive: {resultado.get('message')}"
            }), 500

    else:
        # ── LOCAL: ejecutar el script PowerShell
        ps1_path = os.path.join(ROOT_DIR, 'backup_db.ps1')
        if not os.path.exists(ps1_path):
            return jsonify({
                'success': False,
                'message': f'Script de respaldo no encontrado en: {ps1_path}'
            }), 500

        try:
            result = subprocess.run(
                ['powershell.exe', '-ExecutionPolicy', 'Bypass', '-File', ps1_path, '-Manual'],
                capture_output=True,
                text=True,
                timeout=300
            )
            if result.returncode == 0:
                # Buscar el archivo más reciente generado
                backup_dir = os.getenv('BACKUP_DIR', r'C:\Respaldos_CEI')
                archivos = []
                if os.path.exists(backup_dir):
                    archivos = sorted(
                        [f for f in os.listdir(backup_dir) if f.endswith('.7z') and 'manual' in f],
                        reverse=True
                    )
                return jsonify({
                    'success': True,
                    'message': '✅ Respaldo local completado y encriptado con AES-256.',
                    'archivo': archivos[0] if archivos else None,
                    'timestamp': datetime.now().isoformat()
                }), 200
            else:
                backup_dir = os.getenv('BACKUP_DIR', r'C:\Respaldos_CEI')
                return jsonify({
                    'success': False,
                    'message': f'El script falló. Revisa los logs en {backup_dir}\\backup_log.txt',
                    'stderr': result.stderr[:500]
                }), 500
        except subprocess.TimeoutExpired:
            return jsonify({'success': False, 'message': 'El respaldo tardó demasiado (timeout 5 min).'}), 500
        except Exception as e:
            return jsonify({'success': False, 'message': f'Error al ejecutar respaldo: {str(e)}'}), 500


@app.route('/api/admin/backup-historial', methods=['GET'])
@require_auth
def backup_historial():
    """
    Devuelve el historial de respaldos:
    - En 'production': lista archivos en la carpeta de Drive.
    - En 'local': lista archivos .7z en C:\\Respaldos_CEI.
    Requiere rol administrador.
    """
    if not _verificar_admin():
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403

    entorno = os.getenv('ENVIRONMENT', 'local')
    archivos = []

    if entorno == 'production':
        folder_id = DRIVE_FOLDER_ID
        if not folder_id or not DRIVE_AVAILABLE:
            return jsonify({'success': True, 'archivos': [], 'fuente': 'drive',
                            'mensaje': 'Google Drive no configurado.'}), 200
        try:
            service = _get_drive_service()
            results = service.files().list(
                q=f"'{folder_id}' in parents and name contains 'cei_backup_' and trashed=false",
                fields="files(id, name, createdTime, size)",
                orderBy="createdTime desc",
                pageSize=30
            ).execute()
            for f in results.get('files', []):
                tipo = 'manual' if '_manual' in f['name'] else 'auto'
                tamanio_kb = round(int(f.get('size', 0)) / 1024, 1)
                archivos.append({
                    'nombre':    f['name'],
                    'fecha':     f.get('createdTime', ''),
                    'tamanio':   f'{tamanio_kb} KB',
                    'tipo':      tipo,
                    'drive_id':  f['id']
                })
        except Exception as e:
            return jsonify({'success': False, 'message': f'Error consultando Drive: {str(e)}'}), 500

        return jsonify({'success': True, 'archivos': archivos, 'fuente': 'drive'}), 200

    else:
        # Local: listar archivos en BACKUP_DIR
        backup_dir = os.getenv('BACKUP_DIR', r'C:\Respaldos_CEI')
        if not os.path.exists(backup_dir):
            return jsonify({'success': True, 'archivos': [], 'fuente': 'local',
                            'mensaje': f'Carpeta {backup_dir} no encontrada. Ejecuta el primer respaldo.'}), 200

        try:
            for fname in sorted(os.listdir(backup_dir), reverse=True):
                if fname.endswith('.7z') and fname.startswith('cei_backup_'):
                    fpath = os.path.join(backup_dir, fname)
                    stat  = os.stat(fpath)
                    tipo  = 'manual' if '_manual' in fname else 'auto'
                    fecha_mod = datetime.fromtimestamp(stat.st_mtime).isoformat()
                    tamanio_mb = round(stat.st_size / (1024 * 1024), 2)
                    archivos.append({
                        'nombre':   fname,
                        'fecha':    fecha_mod,
                        'tamanio':  f'{tamanio_mb} MB',
                        'tipo':     tipo,
                        'encriptado': True
                    })
                    if len(archivos) >= 30:
                        break
        except Exception as e:
            return jsonify({'success': False, 'message': f'Error listando respaldos locales: {str(e)}'}), 500

        return jsonify({'success': True, 'archivos': archivos, 'fuente': 'local'}), 200


# =======================================================
# PUNTO DE ENTRADA
# =======================================================

if __name__ == '__main__':
    # debug=True para desarrollo local: permite auto-recarga y errores detallados.
    # threaded=True: permite manejar múltiples requests en paralelo sin bloquearse.
    # En producción (Render), este bloque no se ejecuta.
    IS_DEBUG = os.getenv('FLASK_DEBUG', 'true').lower() == 'true'
    print(f"🚀 Servidor en modo DEBUG: {'Encendido' if IS_DEBUG else 'Apagado'}")
    app.run(debug=IS_DEBUG, port=5000, threaded=True)
