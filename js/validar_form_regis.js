// validar_form_regis.js

document.addEventListener('DOMContentLoaded', () => {
    setupInputMasks();
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Capturamos campos
  const nombresInput = document.getElementById('nombres').value.trim();
  const apellidosInput = document.getElementById('apellidos').value.trim();
  const emailInput = document.getElementById('email').value.trim();
  const phoneInput = document.getElementById('phone').value.trim();
  const passwordInput = document.getElementById('password').value;
  const confirmPasswordInput = document.getElementById('confirm-password').value;
  const termsChecked = document.getElementById('terms').checked;
  const submitBtn = e.target.querySelector('button[type="submit"]');

  // Función para notificaciones SweetAlert
  function showAlert(title, text, icon) {
    Swal.fire({
      title: title,
      text: text,
      icon: icon,
      confirmButtonColor: '#EC4899', // Color Rosa Principal (Paragua)
      customClass: {
        popup: 'rounded-3xl shadow-xl',
        confirmButton: 'rounded-xl px-6 py-2 font-bold'
      }
    });
  }

  // Validaciones básicas
  if (!nombresInput || !apellidosInput || !emailInput || !phoneInput || !passwordInput || !confirmPasswordInput) {
    showAlert('Campos Vacíos', 'Por favor, completa todos los campos requeridos.', 'warning');
    return;
  }
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(passwordInput)) {
    showAlert('Contraseña Insegura', 'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula, una minúscula, un número y un carácter especial (ej: @$!%*?&).', 'warning');
    return;
  }
  if (passwordInput !== confirmPasswordInput) {
    showAlert('Ups...', 'Las contraseñas no coinciden.', 'error');
    return;
  }
  if (!termsChecked) {
    showAlert('Aviso', 'Debes aceptar los Términos y Condiciones.', 'warning');
    return;
  }

  // UI Loading
  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="ph-spinner animate-spin mr-2"></i> Procesando...';

  try {
    // LLAMAMOS AL BACKEND PYTHON (Flask)
    const response = await fetch(`${API_BASE_URL || 'http://127.0.0.1:5000'}/api/registrar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nombres: nombresInput,
        apellidos: apellidosInput,
        email: emailInput,
        phone: phoneInput,
        password: passwordInput
      })
    });

    const result = await response.json();

    if (!response.ok) {
      // Error del backend
      showAlert('Error en el Registro', result.message || 'No se pudo completar la operación.', 'error');
    } else {
      // Éxito exitoso
      Swal.fire({
        title: '¡Cuenta Creada!',
        text: 'Registro exitoso. Por favor, revisa tu bandeja de correo para confirmar la cuenta (Busca también en Spam).',
        icon: 'success',
        confirmButtonColor: '#10B981', // Verde éxito
        allowOutsideClick: false,
        customClass: {
          popup: 'rounded-3xl shadow-2xl',
          confirmButton: 'rounded-xl px-6 py-3 font-bold text-lg'
        }
      }).then((res) => {
        if (res.isConfirmed) {
          // Limpiamos o redirigimos al login
          document.getElementById('register-form').reset();
          window.location.href = 'login.html';
        }
      });
    }

  } catch (err) {
    console.error('Error de red:', err);
    showAlert('Error de Conexión', 'Ocurrió un problema de red. Verifica tu conexión a internet e inténtalo de nuevo.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    submitBtn.innerHTML = originalBtnText;
  }
});

/**
 * Configura restricciones de entrada para evitar números en nombres 
 * y letras en campos numéricos.
 */
function setupInputMasks() {
    const restrict = (id, regex) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', function() {
            this.value = this.value.replace(regex, '');
        });
    };

    const regexSoloTexto = /[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g;
    const regexSoloNumeros = /[^0-9]/g;

    // Nombres y Apellidos
    restrict('nombres', regexSoloTexto);
    restrict('apellidos', regexSoloTexto);

    // Teléfono
    restrict('phone', regexSoloNumeros);
}