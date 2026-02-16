# =======================================================
# SISTEMA DE REGISTRO CON SUPABASE AUTH (SIN SMTP MANUAL)
# =======================================================

from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for
import os
import psycopg2
from psycopg2 import extras
from datetime import datetime
from dotenv import load_dotenv

# --- NUEVA IMPORTACIÓN ---
from supabase import create_client, Client

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'default_secret_key')

# --- CONFIGURACIÓN ---
DATABASE_URL = os.getenv('DATABASE_URL')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Inicializar Cliente de Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
        return conn
    except Exception as err:
        print(f"❌ Error de Conexión: {err}")
        return None

# --- API: REGISTRO (MODIFICADA) ---
@app.route('/api/registrar', methods=['POST'])
def registrar_representante():
    data = request.json
    nombre_completo = data.get('nombre_completo')
    email = data.get('email')
    telefono = data.get('telefono')
    contrasena = data.get('contrasena')

    if not all([nombre_completo, email, telefono, contrasena]):
        return jsonify({'success': False, 'message': 'Faltan datos.'}), 400

    # 1. Intentamos registrar en Supabase Auth
    # Esto crea el usuario, hashea la contraseña y ENVÍA EL CORREO automáticamente.
    try:
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": contrasena,
            "options": {
                "data": {
                    "full_name": nombre_completo,
                    "phone": telefono
                }
            }
        })
        
        # Si el usuario ya existe o hay error, Supabase lanza excepción o devuelve error
        if not auth_response.user and not auth_response.session:
             # Nota: Si "Confirm Email" está activado, user se crea pero session es None hasta que confirme
             pass 

    except Exception as e:
        # Manejo de errores de Supabase (ej: Email ya registrado)
        print(f"Error Supabase: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 400

    # 2. Guardar datos en tu tabla SQL local
    # ---------------------------------------------------------
    # Obtenemos el ID de Supabase solo para referencia (opcional si luego quieres guardarlo)
    user_id_supabase = auth_response.user.id
    
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            
            # Verificamos si el email ya existe en tu tabla para no duplicar error
            cursor.execute("SELECT id FROM representantes WHERE email = %s", (email,))
            if cursor.fetchone():
                pass # Ya existe el perfil, no hacemos nada
            else:
                # --- CORRECCIÓN AQUÍ ---
                # 1. QUITAMOS 'id' del insert. La base de datos pondrá el número 1, 2, 3 sola.
                # 2. Agregamos valores de relleno para contrasena y token para evitar errores de "Not Null"
                
                insert_query = """
                INSERT INTO representantes (
                    nombre_completo, 
                    email, 
                    telefono, 
                    fecha_registro, 
                    estado_cuenta,
                    contrasena_hash,
                    token_verificacion
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """
                
                cursor.execute(insert_query, (
                    nombre_completo, 
                    email, 
                    telefono, 
                    datetime.now(), 
                    'pendiente_verificacion',
                    'GESTIONADO_POR_SUPABASE', # Relleno: Ya no usamos esto, pero tu tabla lo pide
                    'ENVIADO_POR_SUPABASE'     # Relleno: Ya no usamos esto, pero tu tabla lo pide
                ))
                
                conn.commit()
                cursor.close()
                print(f"✅ Usuario guardado en tabla representantes: {email}")

        except Exception as db_err:
            # Si falla aquí, imprimimos el error pero NO devolvemos error 500 al usuario,
            # porque el registro en Supabase (Auth) sí funcionó.
            print(f"⚠️ Alerta: Usuario creado en Auth pero error en tabla local: {db_err}")
            # Hacemos rollback para limpiar la transacción fallida
            if conn: conn.rollback()
        finally:
            conn.close()

    return jsonify({
        'success': True, 
        'message': 'Registro exitoso. Revisa tu correo para confirmar la cuenta.'
    }), 201


# --- RUTAS ESTÁTICAS ---
@app.route('/')
def index(): return send_from_directory(os.getcwd(), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename): return send_from_directory(os.getcwd(), filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)