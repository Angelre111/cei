# =======================================================
# SISTEMA DE LOGIN CON SUPABASE AUTH
# =======================================================

from flask import Flask, request, jsonify, session
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Configuración de Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Inicializar Cliente de Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def login_user(email: str, password: str):
    """
    Autentica al usuario usando Supabase Auth.
    
    Args:
        email: Correo electrónico del usuario
        password: Contraseña del usuario
    
    Returns:
        dict: {'success': bool, 'message': str, 'user': dict (opcional)}
    """
    try:
        # Intentar login con Supabase Auth
        auth_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        
        # Verificar si el login fue exitoso
        if auth_response.user and auth_response.session:
            # Verificar si el email está confirmado
            if not auth_response.user.email_confirmed_at:
                return {
                    'success': False,
                    'message': 'Por favor verifica tu correo electrónico antes de iniciar sesión.',
                    'status_code': 403
                }
            
            return {
                'success': True,
                'message': 'Login exitoso',
                'user': {
                    'id': auth_response.user.id,
                    'email': auth_response.user.email,
                    'metadata': auth_response.user.user_metadata
                },
                'session': {
                    'access_token': auth_response.session.access_token,
                    'refresh_token': auth_response.session.refresh_token
                },
                'status_code': 200
            }
        else:
            return {
                'success': False,
                'message': 'Credenciales incorrectas.',
                'status_code': 401
            }
            
    except Exception as e:
        error_message = str(e)
        print(f"❌ Error en login: {error_message}")
        
        # Manejar errores específicos de Supabase
        if 'Invalid login credentials' in error_message or 'invalid' in error_message.lower():
            return {
                'success': False,
                'message': 'Usuario o contraseña incorrectos.',
                'status_code': 401
            }
        elif 'Email not confirmed' in error_message:
            return {
                'success': False,
                'message': 'Por favor verifica tu correo electrónico.',
                'status_code': 403
            }
        else:
            return {
                'success': False,
                'message': 'Error al iniciar sesión. Intenta nuevamente.',
                'status_code': 500
            }