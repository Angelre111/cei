// Detecta si estamos abriendolo con doble clic (file:), en Live Server (127.0.0.1 / localhost), etc.
const isLocal = window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

window.API_BASE_URL = isLocal
    ? 'http://127.0.0.1:5000'                       // ✅ Flask local (puerto 5000)
    : 'https://ceilaparagua.onrender.com';          // ✅ Backend Flask en Render (Docker)

const SUPABASE_URL = 'https://yfvupxrrvqfwafvozypn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VnDNWpwncQFFonAktaYOqw_zAXNMtg6';

console.log('🚀 API Configurada en:', API_BASE_URL);
