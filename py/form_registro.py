# =======================================================
# VALIDACIÓN DEL FORMULARIO DE REGISTRO CON PYTHON (FLASK)
# =======================================================

# Librerías requeridas:
# pip install Flask mysql-connector-python Flask-Bcrypt
from flask import Flask, request, jsonify, send_from_directory
import os
import mysql.connector
from flask_bcrypt import Bcrypt
import re # Módulo para expresiones regulares (validación de email)
from form_inicio import validate_login

# Sirve archivos estáticos desde el directorio del proyecto en desarrollo
# Esto facilita probar `index.html` y otros .html sin configurar un servidor aparte.
app = Flask(__name__)
bcrypt = Bcrypt(app)

# --- CONFIGURACIÓN DE LA BASE DE DATOS (REEMPLAZA ESTOS VALORES) ---
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'cei'
}

def get_db_connection():
    """Establece y devuelve una conexión a la base de datos MySQL."""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except mysql.connector.Error as err:
        print(f"Error al conectar a MySQL: {err}")
        return None

# --- VALIDACIONES BÁSICAS ---

def validar_email(email):
    """Verifica el formato del correo electrónico."""
    # Expresión regular simple para verificar el formato del email
    if re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return True
    return False

def email_ya_existe(email, cursor):
    """Verifica si el correo electrónico ya está registrado en la base de datos."""
    query = "SELECT COUNT(*) FROM representantes WHERE email = %s"
    cursor.execute(query, (email,))
    count = cursor.fetchone()[0]
    return count > 0

# --- RUTA PRINCIPAL DE REGISTRO ---

@app.route('/api/registrar', methods=['POST'])
def registrar_representante():
    """Maneja la solicitud POST del formulario de registro."""
    data = request.json

    # 1. Extracción de datos
    nombre_completo = data.get('nombre_completo')
    email = data.get('email')
    telefono = data.get('telefono')
    contrasena = data.get('contrasena')

    # 2. Validación de campos obligatorios
    if not all([nombre_completo, email, telefono, contrasena]):
        return jsonify({
            'success': False,
            'message': 'Todos los campos son obligatorios.'
        }), 400 # Bad Request

    # 3. Validación de formato de datos
    if not validar_email(email):
        return jsonify({
            'success': False,
            'message': 'El formato del correo electrónico no es válido.'
        }), 400

    if len(contrasena) < 8:
        return jsonify({
            'success': False,
            'message': 'La contraseña debe tener al menos 8 caracteres.'
        }), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({
            'success': False,
            'message': 'Error interno del servidor al conectar con la base de datos.'
        }), 500

    cursor = conn.cursor()

    try:
        # 4. Validación de unicidad (Email)
        if email_ya_existe(email, cursor):
            return jsonify({
                'success': False,
                'message': 'Este correo electrónico ya está registrado.'
            }), 409 # Conflict

        # 5. Hashing de la contraseña (¡CRÍTICO para la seguridad!)
        hashed_password = bcrypt.generate_password_hash(contrasena).decode('utf-8')

        # 6. Preparación de la consulta SQL de inserción
        insert_query = """
        INSERT INTO representantes (nombre_completo, email, telefono, contrasena_hash, activo)
        VALUES (%s, %s, %s, %s, %s)
        """
        # activo = 1 porque, por ahora, omitimos la verificación por correo
        cursor.execute(insert_query, (nombre_completo, email, telefono, hashed_password, 1))

        # 7. Confirmar la transacción
        conn.commit()

        # Respuesta de éxito (cuenta activada automáticamente)
        return jsonify({
            'success': True,
            'message': 'Registro exitoso.'
        }), 201 # Created

    except mysql.connector.Error as err:
        conn.rollback()
        print(f"Error de base de datos durante la inserción: {err}")
        return jsonify({
            'success': False,
            'message': f'Error en la base de datos: {err}'
        }), 500

    finally:
        cursor.close()
        conn.close()


@app.route('/api/login', methods=['POST'])
def api_login():
    """Endpoint para iniciar sesión.

    Recibe JSON { email, password }. Usa `validate_login` de `form_inicio.py`.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'success': False, 'message': 'JSON inválido.'}), 400

    # Validación del formato de entrada
    is_valid, errors = validate_login(data)
    if not is_valid:
        return jsonify({'success': False, 'message': 'Errores de validación.', 'errors': errors}), 400

    email = data.get('email')
    password = data.get('password')

    conn = get_db_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'Error interno: no se pudo conectar a la base de datos.'}), 500

    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, contrasena_hash, activo FROM representantes WHERE email = %s", (email,))
        row = cursor.fetchone()
        if not row:
            # No dar detalles para evitar enumeración de usuarios
            return jsonify({'success': False, 'message': 'Credenciales inválidas.'}), 401

        user_id, contrasena_hash, activo = row[0], row[1], row[2]

        # Verificar contraseña
        if not bcrypt.check_password_hash(contrasena_hash, password):
            return jsonify({'success': False, 'message': 'Credenciales inválidas.'}), 401

        if activo != 1:
            return jsonify({'success': False, 'message': 'Cuenta no verificada. Revisa tu correo.'}), 403

        # Login exitoso — aquí podrías crear sesión o devolver un token
        return jsonify({'success': True, 'message': 'Login correcto.'}), 200

    except mysql.connector.Error as err:
        print('Error en login (BD):', err)
        return jsonify({'success': False, 'message': 'Error interno en la base de datos.'}), 500
    finally:
        cursor.close()
        conn.close()

# Nota: app.run se llama al final del archivo, después de declarar todas las rutas.


@app.route('/')
def index():
    """Sirve el archivo index.html desde la raíz del proyecto."""
    # Si estás ejecutando el script desde la raíz (cd .../cei), app.send_static_file funciona.
    # Si por alguna razón no encuentra el archivo, send_from_directory con cwd absoluto es alternativa.
    try:
        return app.send_static_file('index.html')
    except Exception:
        return send_from_directory(os.getcwd(), 'index.html')


# Rutas explícitas para servir las páginas y recursos (desarrollo)
@app.route('/form_registro.html')
def serve_form():
    return send_from_directory(os.getcwd(), 'form_registro.html')


@app.route('/login.html')
def serve_login():
    return send_from_directory(os.getcwd(), 'login.html')

@app.route('/representante.html')
def serve_representante():
    return send_from_directory(os.getcwd(), 'representante.html')


@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(os.getcwd(), 'css'), filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(os.getcwd(), 'js'), filename)


@app.route('/img/<path:filename>')
def serve_img(filename):
    return send_from_directory(os.path.join(os.getcwd(), 'img'), filename)


if __name__ == '__main__':
    # Mostrar rutas registradas y directorio de trabajo para depuración
    try:
        print('Directorio de trabajo (cwd):', os.getcwd())
        print('Rutas registradas:')
        print(app.url_map)
    except Exception:
        pass

    # ¡IMPORTANTE! En un entorno de producción, no uses debug=True ni sirvas archivos así.
    app.run(debug=True, port=5000)