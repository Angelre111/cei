# =======================================================
# SISTEMA DE REGISTRO CON ENVÍO REAL DE CORREOS (GMAIL)
# =======================================================

from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for
import os
import psycopg2
from psycopg2 import extras
from flask_bcrypt import Bcrypt
import re
import secrets 
from form_inicio import validate_login

# --- LIBRERÍAS PARA EMAIL (NUEVO) ---
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'default_secret_key')
bcrypt = Bcrypt(app) 

# --- CONFIGURACIÓN EMAIL (¡Edita esto!) ---
SMTP_EMAIL = os.getenv('SMTP_EMAIL')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')

# --- CONFIGURACIÓN BASE DE DATOS ---
# --- CONFIGURACIÓN BASE DE DATOS (Supabase/PostgreSQL) ---
# La URL de conexión completa suele ser más fácil para bibliotecas como psycopg2
# Formato: postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DB_NAME]
DATABASE_URL = os.getenv('DATABASE_URL')

def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as err:
        print(f"Error Conexión BD: {err}")
        return None

# --- FUNCIÓN DE ENVÍO DE CORREO REAL (NUEVO) ---
def enviar_correo_verificacion(destinatario, token):
    try:
        # Configurar el mensaje
        msg = MIMEMultipart()
        msg['From'] = SMTP_EMAIL
        msg['To'] = destinatario
        msg['Subject'] = "Valida tu cuenta - Inscripciones CEI"

        # El enlace (OJO: En producción cambia localhost por tu dominio real)
        link = f"http://127.0.0.1:5000/api/verificar-email?token={token}"

        # Cuerpo del correo en HTML (Diseño bonito)
        cuerpo_html = f"""
        <!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f7ff; padding: 40px 10px;">
    
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
        
        <!-- Espacio para el Logo -->
        <div style="padding: 30px 20px 10px 20px; text-align: center;">
            <!-- Aquí colocas la URL de tu logo -->
            <img src="../img/cei.png" width="100" height="100" viewBox="0 0 24 24" fill="none">
        </div>

        <div style="padding: 30px 40px;">
            <h2 style="color: #0284c7; text-align: center; font-size: 26px; margin-bottom: 20px;">¡Bienvenido al Sistema!</h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hola, <strong>Representante</strong>:</p>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                ¡Qué alegría tenerte con nosotros! Gracias por registrarte en nuestro portal educativo. Para completar el proceso de inscripción de tu representado, necesitamos validar tu dirección de correo electrónico.
            </p>

            <!-- Botón de Acción -->
            <div style="text-align: center; margin: 40px 0;">
                <a href="{link}" style="background-color: #ec4899; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 14px; font-weight: bold; font-size: 18px; display: inline-block; box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);">
                    Verificar mi Cuenta
                </a>
            </div>

            <p style="color: #6b7280; font-size: 14px; line-height: 1.5; text-align: center;">
                Si el botón de arriba no funciona, puedes copiar y pegar este enlace en tu navegador:
            </p>
            
            <p style="background-color: #f8fafc; padding: 15px; border-radius: 10px; font-size: 12px; color: #3b82f6; text-align: center; word-break: break-all;">
                {link}
            </p>

            <div style="border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 20px; text-align: center;">
                <p style="color: #9ca3af; font-size: 13px;">
                    Este es un mensaje automático, por favor no respondas a este correo.<br>
                    <strong>Sistema Escolar de Preescolar</strong>
                </p>
            </div>
        </div>
        
        <!-- Decoración Inferior Estilo Preescolar -->
        <div style="background-color: #e0f2fe; height: 10px; width: 100%;"></div>
    </div>
    
    <div style="text-align: center; margin-top: 20px;">
        <p style="color: #94a3b8; font-size: 12px;">© 2023 Tu Institución Educativa. Todos los derechos reservados.</p>
    </div>

</body>
</html>
        """
        
        msg.attach(MIMEText(cuerpo_html, 'html'))

        # Conexión con Gmail (Puerto 465 para SSL)
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"✅ Correo enviado correctamente a {destinatario}")
        return True

    except Exception as e:
        print(f"❌ Error enviando correo: {e}")
        return False

# --- VALIDACIONES AUXILIARES ---
def email_ya_existe(email, cursor):
    cursor.execute("SELECT COUNT(*) FROM representantes WHERE email = %s", (email,))
    return cursor.fetchone()[0] > 0

# --- API: REGISTRO ---
@app.route('/api/registrar', methods=['POST'])
def registrar_representante():
    data = request.json
    nombre_completo = data.get('nombre_completo')
    email = data.get('email')
    telefono = data.get('telefono')
    contrasena = data.get('contrasena')

    if not all([nombre_completo, email, telefono, contrasena]):
        return jsonify({'success': False, 'message': 'Faltan datos.'}), 400

    conn = get_db_connection()
    if not conn: return jsonify({'success': False, 'message': 'Error de BD'}), 500
    cursor = conn.cursor()

    try:
        if email_ya_existe(email, cursor):
            return jsonify({'success': False, 'message': 'Correo ya registrado.'}), 409

        hashed_password = bcrypt.generate_password_hash(contrasena).decode('utf-8')
        token = secrets.token_urlsafe(32)
        estado_inicial = 'pendiente_verificacion'

        insert_query = """
        INSERT INTO representantes (nombre_completo, email, telefono, contrasena_hash, fecha_registro, estado_cuenta, token_verificacion)
        VALUES (%s, %s, %s, %s, NOW(), %s, %s)
        """
        cursor.execute(insert_query, (nombre_completo, email, telefono, hashed_password, estado_inicial, token))
        conn.commit()

        # --- AQUÍ LLAMAMOS A LA FUNCIÓN DE CORREO REAL ---
        envio_exitoso = enviar_correo_verificacion(email, token)

        if envio_exitoso:
            return jsonify({'success': True, 'message': 'Registro exitoso. Se ha enviado un correo de verificación.'}), 201
        else:
            # Si falla el correo, podrías decidir borrar el usuario o avisar que hubo un problema
            return jsonify({'success': True, 'message': 'Registro guardado, pero hubo un error enviando el correo. Contacte soporte.'}), 201

    except psycopg2.Error as err:
        conn.rollback()
        return jsonify({'success': False, 'message': f'Error BD: {err}'}), 500
    finally:
        cursor.close()
        conn.close()

# --- API: VERIFICACIÓN ---
@app.route('/api/verificar-email', methods=['GET'])
def verificar_email():
    token = request.args.get('token')
    if not token: return "Token inválido", 400

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        cursor.execute("SELECT id, email, nombre_completo FROM representantes WHERE token_verificacion = %s", (token,))
        user = cursor.fetchone()

        if not user: return "Enlace inválido o expirado.", 400

        cursor.execute("UPDATE representantes SET estado_cuenta = 'activo_incompleto', token_verificacion = NULL WHERE id = %s", (user['id'],))
        conn.commit()

        session['user_id'] = user['id']
        session['email'] = user['email']
        
        return redirect('/formulario.html') 

    except Exception as e:
        return f"Error: {e}", 500
    finally:
        cursor.close()
        conn.close()

# --- API: LOGIN ---
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(silent=True)
    if not data: return jsonify({'success': False}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, contrasena_hash, estado_cuenta FROM representantes WHERE email = %s", (data.get('email'),))
        row = cursor.fetchone()
        
        if row and bcrypt.check_password_hash(row[1], data.get('password')):
            if row[2] == 'pendiente_verificacion':
                return jsonify({'success': False, 'message': 'Verifica tu correo primero.'}), 403
            
            session['user_id'] = row[0]
            session['email'] = data.get('email')
            return jsonify({'success': True}), 200
            
        return jsonify({'success': False, 'message': 'Datos incorrectos'}), 401
    finally:
        cursor.close()
        conn.close()

# --- RUTAS ESTÁTICAS ---
@app.route('/')
def index(): return send_from_directory(os.getcwd(), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename): return send_from_directory(os.getcwd(), filename)

@app.route('/css/<path:filename>')
def serve_css(filename): return send_from_directory(os.path.join(os.getcwd(), 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename): return send_from_directory(os.path.join(os.getcwd(), 'js'), filename)

@app.route('/img/<path:filename>')
def serve_img(filename): return send_from_directory(os.path.join(os.getcwd(), 'img'), filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)