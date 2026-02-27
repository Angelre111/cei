const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? window.location.origin
    : 'https://animated-gnome-3fdf38.netlify.app/';

const SUPABASE_URL = 'https://yfvupxrrvqfwafvozypn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VnDNWpwncQFFonAktaYOqw_zAXNMtg6';

console.log('🚀 API Configurada en:', API_BASE_URL);

