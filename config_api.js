// Configuración de API para desarrollo
// Este archivo se puede incluir en admin.html para configurar la URL base de la API

// URL base de la API Flask
// En desarrollo: http://127.0.0.1:5000
// En producción: URL del servidor desplegado
// Detecta automáticamente si estamos en local o en producción
const _isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
window.API_BASE_URL = _isLocal
    ? 'http://127.0.0.1:5000'
    : 'https://ceilaparagua.onrender.com';

console.log('API Base URL configurada:', window.API_BASE_URL);

// Función para verificar conexión con la API
async function verificarConexionAPI() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.warn('No hay token de autenticación');
            return false;
        }
        
        const response = await fetch(`${window.API_BASE_URL}/api/test`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            console.log('✅ Conexión con API establecida');
            return true;
        } else {
            console.warn('⚠️ No se pudo conectar con la API');
            return false;
        }
    } catch (error) {
        console.error('❌ Error de conexión con API:', error);
        return false;
    }
}

// Función para configurar API desde consola (para pruebas)
function configurarAPI(url) {
    window.API_BASE_URL = url;
    console.log(`API Base URL actualizada: ${url}`);
    return `API configurada a: ${url}`;
}

// Ejecutar verificación al cargar (opcional)
// document.addEventListener('DOMContentLoaded', verificarConexionAPI);