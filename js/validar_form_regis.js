// validar_form_regis.js
// El cliente de Supabase se inicializa usando las constantes de config.js
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById('name').value.trim();
  const emailInput = document.getElementById('email').value.trim();
  const phoneInput = document.getElementById('phone').value.trim();
  const passwordInput = document.getElementById('password').value;
  const confirmPasswordInput = document.getElementById('confirm-password').value;
  const termsChecked = document.getElementById('terms').checked;
  const messageBox = document.getElementById('message-box');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  // Función para mostrar mensajes
  function showMessage(message, classes) {
    messageBox.innerHTML = message;
    messageBox.className = 'p-3 rounded-lg text-sm mb-6 font-medium text-center transition-opacity duration-300 ' + classes;
    messageBox.classList.remove('hidden');
  }

  // Validaciones básicas
  if (!nameInput || !emailInput || !phoneInput || !passwordInput || !confirmPasswordInput) {
    showMessage('Por favor, completa todos los campos requeridos.', 'bg-yellow-100 text-yellow-800');
    return;
  }
  if (passwordInput.length < 8) {
    showMessage('La contraseña debe tener al menos 8 caracteres.', 'bg-red-100 text-red-800');
    return;
  }
  if (passwordInput !== confirmPasswordInput) {
    showMessage('Las contraseñas no coinciden.', 'bg-red-100 text-red-800');
    return;
  }
  if (!termsChecked) {
    showMessage('Debes aceptar los Términos y Condiciones.', 'bg-yellow-100 text-yellow-800');
    return;
  }

  // UI Loading
  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="ph-spinner animate-spin mr-2"></i> Procesando...';

  try {
    // 1. Registro directo en Supabase Auth
    const { data, error } = await _supabase.auth.signUp({
      email: emailInput,
      password: passwordInput,
      options: {
        data: {
          full_name: nameInput,
          phone: phoneInput
        },
        // Redirección después de confirmar el correo
        emailRedirectTo: window.location.origin + '/form_registro_estudiante.html'
      }
    });

    if (error) {
      showMessage('Error de registro: ' + error.message, 'bg-red-100 text-red-800');
    } else {
      showMessage('¡Registro exitoso! Revisa tu correo para verificar tu cuenta y continuar.', 'bg-green-100 text-green-800');
      document.getElementById('register-form').reset();
    }
  } catch (err) {
    console.error('Error:', err);
    showMessage('Ocurrió un error inesperado. Inténtalo de nuevo.', 'bg-red-100 text-red-800');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    submitBtn.innerHTML = originalBtnText;
  }
});