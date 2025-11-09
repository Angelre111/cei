import re
from typing import Dict, Any, Tuple

__all__ = ['validate_login']


def validate_login(data: Dict[str, Any]) -> Tuple[bool, Dict[str, str]]:
    """Valida los datos de login recibidos.

    Entrada: data = { 'email': ..., 'password': ... }
    Salida: (is_valid, errors_dict)
    """
    errors: Dict[str, str] = {}

    if not data or not isinstance(data, dict):
        errors['payload'] = 'JSON inválido o no proporcionado.'
        return False, errors

    email = (data.get('email') or '').strip()
    password = data.get('password') or ''

    # Validación del email
    if not email:
        errors['email'] = 'El correo es requerido.'
    elif not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        errors['email'] = 'Formato de correo inválido.'

    # Validación de la contraseña
    if not password:
        errors['password'] = 'La contraseña es requerida.'
    elif len(password) < 8:
        errors['password'] = 'La contraseña debe tener al menos 8 caracteres.'

    return (len(errors) == 0), errors