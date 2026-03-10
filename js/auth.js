// =============================================================
// auth.js — Módulo de autenticación compartido
// Provee fetchWithAuth() con auto-refresh del JWT token.
// Incluir ANTES de admin_users.js y admin_periodos.js
// =============================================================

const AUTH = {
    getToken() { return localStorage.getItem('auth_token') || ''; },
    getRefreshToken() { return localStorage.getItem('refresh_token') || ''; },
    saveTokens(token, refreshToken) {
        localStorage.setItem('auth_token', token);
        if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    },
    clear() {
        ['auth_token', 'refresh_token', 'user_rol', 'user_email', 'user_id']
            .forEach(k => localStorage.removeItem(k));
    },
    headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getToken()}`
        };
    }
};

// ─── Bandera para evitar múltiples refreshes en paralelo ─────
let _refreshing = null;

async function _doRefresh() {
    const rt = AUTH.getRefreshToken();
    if (!rt) throw new Error('Sin refresh_token');

    const res = await fetch(`${API_BASE_URL}/api/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt })
    });
    const json = await res.json();

    if (!res.ok) throw new Error(json.message || 'Sesión expirada');

    AUTH.saveTokens(json.token, json.refresh_token);
    return json.token;
}

/**
 * fetchWithAuth(url, options)
 * Wrapper sobre fetch() que:
 *  1. Agrega el header Authorization automáticamente
 *  2. Si recibe 401 → intenta refrescar el token y reintenta UNA vez
 *  3. Si el refresh falla → redirige al login
 */
async function fetchWithAuth(url, options = {}) {
    // Asegurar headers de auth
    options.headers = { ...AUTH.headers(), ...(options.headers || {}) };
    // Quitar Content-Type si es FormData
    if (options.body instanceof FormData) delete options.headers['Content-Type'];

    let res = await fetch(url, options);

    if (res.status === 401) {
        // Solo un refresh a la vez (aunque haya múltiples peticiones paralelas)
        if (!_refreshing) {
            _refreshing = _doRefresh().finally(() => { _refreshing = null; });
        }

        try {
            const newToken = await _refreshing;
            // Reintentar la petición original con el nuevo token
            options.headers['Authorization'] = `Bearer ${newToken}`;
            res = await fetch(url, options);
        } catch (err) {
            console.warn('⚠️ Token expirado y refresh fallido. Redirigiendo al login.', err);
            AUTH.clear();
            Swal.fire({
                title: 'Sesión expirada',
                text: 'Tu sesión ha terminado. Por favor inicia sesión nuevamente.',
                icon: 'warning',
                confirmButtonColor: '#EC4899',
                allowOutsideClick: false
            }).then(() => window.location.replace('login.html'));
            // Devolver respuesta 401 para que el caller pueda manejarlo si quiere
            return new Response(JSON.stringify({ success: false, message: 'Sesión expirada' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
    }

    return res;
}
