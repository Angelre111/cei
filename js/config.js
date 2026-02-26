const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://animated-gnome-3fdf38.netlify.app/';

console.log('🚀 API Configurada en:', API_BASE_URL);
