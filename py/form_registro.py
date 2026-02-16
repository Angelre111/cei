# =======================================================
# SISTEMA DE REGISTRO CON ENVÍO REAL DE CORREOS (GMAIL)
# =======================================================

from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for
import os
import psycopg2
from psycopg2 import extras
from flask_bcrypt import Bcrypt
import secrets 
from datetime import datetime

# --- LIBRERÍAS PARA EMAIL ---
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'default_secret_key')
bcrypt = Bcrypt(app) 

# --- CONFIGURACIÓN ---
SMTP_EMAIL = os.getenv('SMTP_EMAIL')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD') # Asegúrate que en Render NO tenga espacios
DATABASE_URL = os.getenv('DATABASE_URL')

def get_db_connection():
    try:
        # Forzamos sslmode y un timeout prudente
        conn = psycopg2.connect(
            DATABASE_URL, 
            connect_timeout=15
        )
        return conn
    except Exception as err:
        print(f"❌ Error de Conexión: {err}")
        return None

def enviar_correo_verificacion(destinatario, token):
    print(f"DEBUG: Intentando enviar correo a {destinatario}...")
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_EMAIL
        msg['To'] = destinatario
        msg['Subject'] = "Valida tu cuenta - Inscripciones CEI"

        link = f"https://cei-preescolar.onrender.com/api/verificar-email?token={token}"

        cuerpo_html = f"""
        <html>
            <body style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h2>¡Bienvenido!</h2>
                <p>Haz clic en el botón para activar tu cuenta:</p>
                <a href="{link}" style="background: #ec4899; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px;">Verificar Cuenta</a>
                <p style="margin-top: 20px; font-size: 12px;">Si no funciona, usa este link: {link}</p>
            </body>
        </html>
        """
        msg.attach(MIMEText(cuerpo_html, 'html'))

        # --- CAMBIO AQUÍ: Forzamos el uso de SMTP de Gmail por el puerto 587 ---
        # Si 'smtp.gmail.com' sigue fallando, usaremos una técnica para forzar IPv4
        server = smtplib.SMTP('74.125.141.108', 587, timeout=15) # Esta es una IP de Gmail (IPv4)
        server.ehlo() 
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        
        print(f"✅ Correo enviado a {destinatario}")
        return True

    except Exception as e:
        print(f"❌ Error enviando correo: {e}")
        # Intentamos un segundo método si la IP falla (Plan B)
        try:
            print("Intentando Plan B con nombre de host...")
            server = smtplib.SMTP('smtp.gmail.com', 587, timeout=15)
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
            server.quit()
            print(f"✅ Correo enviado a {destinatario} (Plan B)")
            return True
        except Exception as e2:
            print(f"❌ Falló Plan B también: {e2}")
            return False

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
    if not conn: 
        return jsonify({'success': False, 'message': 'Error de conexión con la base de datos.'}), 500
    
    cursor = conn.cursor()

    try:
        if email_ya_existe(email, cursor):
            return jsonify({'success': False, 'message': 'Este correo ya está registrado.'}), 409

        hashed_password = bcrypt.generate_password_hash(contrasena).decode('utf-8')
        token = secrets.token_urlsafe(32)
        
        insert_query = """
        INSERT INTO representantes (nombre_completo, email, telefono, contrasena_hash, fecha_registro, estado_cuenta, token_verificacion)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(insert_query, (nombre_completo, email, telefono, hashed_password, datetime.now(), 'pendiente_verificacion', token))
        
        # EL COMMIT DEBE IR ANTES DEL CORREO PARA ASEGURAR QUE SE GUARDE
        conn.commit()
        print(f"✅ Usuario {email} guardado en Supabase.")

        # Intentamos enviar el correo
        envio_exitoso = enviar_correo_verificacion(email, token)

        if envio_exitoso:
            return jsonify({'success': True, 'message': 'Registro exitoso. Revisa tu correo.'}), 201
        else:
            return jsonify({'success': True, 'message': 'Cuenta creada, pero hubo un error al enviar el email. Contacta a soporte.'}), 201

    except Exception as err:
        print(f"❌ Error en proceso de registro: {err}")
        if conn: conn.rollback()
        return jsonify({'success': False, 'message': f'Error interno: {err}'}), 500
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
        cursor.execute("SELECT id, email FROM representantes WHERE token_verificacion = %s", (token,))
        user = cursor.fetchone()
        if not user: return "Enlace inválido o expirado.", 400
        cursor.execute("UPDATE representantes SET estado_cuenta = 'activo_incompleto', token_verificacion = NULL WHERE id = %s", (user['id'],))
        conn.commit()
        session['user_id'] = user['id']
        return redirect('/formulario.html') 
    except Exception as e:
        return f"Error: {e}", 500
    finally:
        cursor.close()
        conn.close()

# --- RUTAS ESTÁTICAS ---
@app.route('/')
def index(): return send_from_directory(os.getcwd(), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename): return send_from_directory(os.getcwd(), filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)