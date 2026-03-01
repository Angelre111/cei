document.addEventListener('DOMContentLoaded', () => {
    const btnAddUser = document.getElementById('btn-add-user');

    if (btnAddUser) {
        btnAddUser.addEventListener('click', async () => {
            // 1. Capturar los valores del formulario
            const nombres = document.getElementById('user-first-name').value.trim();
            const apellidos = document.getElementById('user-last-name').value.trim();
            const email = document.getElementById('user-email').value.trim();
            const rol = document.getElementById('user-role').value;
            const password = document.getElementById('user-password').value;

            // 2. Validaciones en el frontend
            if (!nombres || !apellidos || !email || !rol || !password) {
                Swal.fire({
                    title: 'Campos Incompletos',
                    text: 'Por favor, completa todos los campos requeridos.',
                    icon: 'warning',
                    confirmButtonColor: '#F48BAF'
                });
                return;
            }

            // Validación de formato de email (Gmail)
            const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
            if (!emailRegex.test(email)) {
                Swal.fire({
                    title: 'Email Inválido',
                    text: 'Por favor, ingresa un correo con el formato estándar "@gmail.com"',
                    icon: 'error',
                    confirmButtonColor: '#EF4444'
                });
                return;
            }

            if (password.length < 6) {
                Swal.fire({
                    title: 'Contraseña Corta',
                    text: 'La contraseña debe tener al menos 6 caracteres.',
                    icon: 'warning',
                    confirmButtonColor: '#F48BAF'
                });
                return;
            }

            // 3. Cambiar el estado del botón mientras procesa
            const textoOriginal = btnAddUser.innerText;
            btnAddUser.innerText = 'Procesando...';
            btnAddUser.disabled = true;
            btnAddUser.classList.add('opacity-75', 'cursor-not-allowed');

            try {
                // 4. Enviar los datos a la API de Python
                const response = await fetch('/api/crear_personal', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        nombres: nombres,
                        apellidos: apellidos,
                        email: email,
                        rol: rol,
                        password: password
                    })
                });

                const data = await response.json();

                // 5. Manejar la respuesta
                if (response.ok && data.success) {
                    Swal.fire({
                        title: '¡Usuario Creado!',
                        text: data.message,
                        icon: 'success',
                        confirmButtonColor: '#10B981',
                        background: '#ffffff',
                        customClass: {
                            popup: 'rounded-2xl shadow-2xl',
                            confirmButton: 'rounded-xl px-6 py-2 font-bold'
                        }
                    });

                    // Limpiar el formulario completo
                    document.getElementById('user-first-name').value = '';
                    document.getElementById('user-last-name').value = '';
                    document.getElementById('user-email').value = '';
                    document.getElementById('user-role').value = '';
                    document.getElementById('user-password').value = '';

                    // Si tienes una función que renderiza de nuevo la lista de usuarios, llámala aquí
                    if (typeof renderUsers === 'function') {
                        // systemUsers.push(...) - Note: you might need to sync the local 'systemUsers' array if it exists
                    }
                } else {
                    Swal.fire({
                        title: 'Error de Registro',
                        text: data.message || 'No se pudo crear el usuario.',
                        icon: 'error',
                        confirmButtonColor: '#EF4444'
                    });
                }

            } catch (error) {
                console.error('Error en la petición:', error);
                Swal.fire({
                    title: 'Error de Conexión',
                    text: 'Ocurrió un error al conectar con el servidor.',
                    icon: 'error',
                    confirmButtonColor: '#EF4444'
                });
            } finally {
                // 6. Restaurar el botón siempre, haya error o éxito
                btnAddUser.innerText = textoOriginal;
                btnAddUser.disabled = false;
                btnAddUser.classList.remove('opacity-75', 'cursor-not-allowed');
            }
        });
    }
});
