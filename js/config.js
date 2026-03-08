const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:5000'                    // ✅ Flask local (puerto 5000)
    : 'https://cei-preescolar.onrender.com';      // ✅ Backend Flask en Render (NO Netlify)

const SUPABASE_URL = 'https://yfvupxrrvqfwafvozypn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VnDNWpwncQFFonAktaYOqw_zAXNMtg6';

console.log('🚀 API Configurada en:', API_BASE_URL);
