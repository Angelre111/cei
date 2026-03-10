# =======================================================
# SISTEMA DE GESTIÓN ESCOLAR (API BACKEND)
# =======================================================
import os
import traceback
import threading
from typing import Optional, List
from datetime import datetime
from functools import wraps

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
# CORS: Orígenes permitidos
# En producción: el frontend vive en Netlify y llama al backend en Render
# En desarrollo: soportar Flask:5000 y LiveServer:5500
DEFAULT_ORIGINS = (
    'http://127.0.0.1:5000,'
    'http://localhost:5000,'
    'http://127.0.0.1:5500,'
    'http://localhost:5500,'
    'https://animated-gnome-3fdf38.netlify.app,'
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
                "email_redirect_to": os.getenv('REDIRECT_URL', 'http://127.0.0.1:5000/login.html')  
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
        error_msg = str(e)
        print(f"❌ Error Registro: {error_msg}")
        if "already registered" in error_msg.lower() or "already exists" in error_msg.lower():
            return jsonify({'success': False, 'message': 'Este correo electrónico ya está registrado.'}), 409
        return jsonify({'success': False, 'message': 'No se pudo completar el registro. Intenta de nuevo.'}), 500


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
        # 1. Autenticar con Supabase Auth (usamos el cliente secundario para no mutar el admin)
        response = supabase_auth.auth.sign_in_with_password({
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

        # 5. Para representantes, verificar si ya completaron la ficha del estudiante
        ficha_completada = None
        if rol_usuario == 'representante':
            ficha_res = supabase.table("inscripciones").select("id").eq("user_id", user_id).execute()
            ficha_completada = len(ficha_res.data) > 0

        # 6. Enviar respuesta exitosa al Frontend con el rol real
        return jsonify({
            'success': True,
            'message': 'Inicio de sesión exitoso',
            'token': response.session.access_token,
            'refresh_token': response.session.refresh_token,
            'rol': rol_usuario,
            'ficha_completada': ficha_completada,  # None para admin/docentes, True/False para representantes
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
@require_auth
def crear_personal():
    """Ruta para que un admin cree cuentas de otros administradores o docentes. Bloquea representantes."""
    # SEGURIDAD: Verificar que el usuario autenticado sea administrador
    user_id_solicitante = request.current_user.id
    perfil = supabase.table("usuarios").select("rol").eq("id", user_id_solicitante).single().execute()
    if not perfil.data or perfil.data.get("rol") != "administrador":
        return jsonify({'success': False, 'message': 'Acción denegada. Solo los administradores pueden realizar esta acción.'}), 403
    data = request.json
    
    nombres = data.get('nombres')
    apellidos = data.get('apellidos')
    email = data.get('email')
    rol_front = data.get('rol') 
    estado_front = data.get('estado', 'activo')
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
    es_admin = (rol_db == 'administrador')
    estado_inicial = estado_front.lower()

    # Si es admin O si el estado inicial es 'activo', lo confirmamos inmediatamente
    saltar_confirmacion = es_admin or (estado_inicial == 'activo')

    try:
        # 4. Crear el usuario en Supabase Auth
        auth_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": saltar_confirmacion, # <--- Regla condicional dinámica
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
            "estado": estado_inicial # <--- Estado personalizado
        }
        
        supabase.table("usuarios").upsert(datos_usuario).execute()

        # 6. Preparamos un mensaje de respuesta dinámico
        mensaje_exito = f'{rol_front} registrado exitosamente en el sistema.'
        if not saltar_confirmacion:
            mensaje_exito += ' Se ha enviado un correo al usuario para que verifique su cuenta.'

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
# RUTAS DE GESTIÓN DE USUARIOS
# =======================================================

@app.route('/api/usuarios', methods=['GET'])
@require_auth
def listar_usuarios():
    """Devuelve la lista de administradores y docentes para el panel admin."""
    try:
        response = supabase.table("usuarios") \
            .select("id, nombres, apellidos, email, rol, estado") \
            .in_("rol", ["administrador", "docente"]) \
            .order("created_at", desc=True) \
            .execute()

        return jsonify({'success': True, 'usuarios': response.data}), 200

    except Exception as e:
        print(f"❌ Error al listar usuarios: {e}")
        return jsonify({'success': False, 'message': 'Error al obtener usuarios.'}), 500


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
    campos_permitidos = ['nombres', 'apellidos', 'estado', 'rol']
    datos_update = {k: v for k, v in data.items() if k in campos_permitidos and v is not None}

    # Validación estricta del rol si viene en la petición
    if 'rol' in datos_update and datos_update['rol'] not in ['administrador', 'docente']:
        return jsonify({'success': False, 'message': 'Rol inválido. Solo se permite "administrador" o "docente".'}), 400

    # Seguridad: Un admin no puede cambiar su propio rol ni estado (se quedaría sin acceso)
    if solicitante_id == user_id and ('rol' in datos_update or 'estado' in datos_update):
        return jsonify({'success': False, 'message': 'No puedes cambiar tu propio rol ni estado.'}), 400

    if not datos_update:
        return jsonify({'success': False, 'message': 'No hay campos válidos para actualizar.'}), 400

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
    """Obtiene todos los estudiantes asignados a una sección para mostrar la tabla general."""
    try:
        # Buscamos las asignaciones activas (incluyendo aquellas con estado NULL por retrocompatibilidad)
        res_asignaciones = supabase.table("asignaciones_estudiantes").select("*").or_("estado.eq.cursando,estado.is.null").execute()
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
            representante_nombre = "Desconocido"
            if hijo and hijo.get('representante_id'):
                res_u = supabase.table("usuarios").select("nombres, apellidos").eq("id", hijo.get('representante_id')).execute()
                if res_u.data:
                    rep = res_u.data[0]
                    representante_nombre = f"{rep.get('nombres', '')} {rep.get('apellidos', '')}".strip()
                    
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

            representante_nombre = "Desconocido"
            if hijo and hijo.get('representante_id'):
                res_u = supabase.table("usuarios").select("nombres, apellidos").eq("id", hijo.get('representante_id')).execute()
                if res_u.data:
                    rep = res_u.data[0]
                    representante_nombre = f"{rep.get('nombres', '')} {rep.get('apellidos', '')}".strip()
                    
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
    """Marca a un estudiante como 'retirado' en la tabla asignaciones_estudiantes."""
    try:
        data = supabase.table("asignaciones_estudiantes").update({"estado": "retirado"}).eq("id", asignacion_id).execute()
        
        if not data.data:
            return jsonify({'success': False, 'message': 'Asignación no encontrada.'}), 404
            
        return jsonify({'success': True, 'message': 'Estudiante retirado de la sección exitosamente.'}), 200

    except Exception as e:
        print(f"❌ Error al retirar estudiante: {e}")
        return jsonify({'success': False, 'message': 'Error interno al cambiar el estado del estudiante.'}), 500

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


@app.route('/api/periodos', methods=['GET'])
@require_auth
def listar_periodos():
    """Lista todos los períodos académicos ordenados por fecha de inicio descendente."""
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Acción denegada. Solo administradores.'}), 403
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
    """Obtiene todas las secciones con su período y docente asociado."""
    if not _verificar_admin(request.current_user.id):
        return jsonify({'success': False, 'message': 'Solo administradores.'}), 403
    try:
        # Hacemos JOIN con periodos_academicos
        # También buscamos el docente asociado a través de docentes_secciones
        response = supabase.table("secciones") \
            .select("id, nivel, letra, capacidad_maxima, periodo_id, periodos_academicos(nombre), docentes_secciones(docente_id, usuarios(nombres, apellidos))") \
            .execute()
        
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

            secciones.append({
                "id": s["id"],
                "nivel": s["nivel"],
                "letra": s["letra"],
                "capacidad_maxima": s["capacidad_maxima"],
                "periodo_id": s["periodo_id"],
                "periodo_nombre": periodo_nombre,
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
    # debug=True para desarrollo local: permite auto-recarga y errores detallados.
    # threaded=True: permite manejar múltiples requests en paralelo sin bloquearse.
    # En producción (Render), este bloque no se ejecuta.
    IS_DEBUG = os.getenv('FLASK_DEBUG', 'true').lower() == 'true'
    print(f"🚀 Servidor en modo DEBUG: {'Encendido' if IS_DEBUG else 'Apagado'}")
    app.run(debug=IS_DEBUG, port=5000, threaded=True)
