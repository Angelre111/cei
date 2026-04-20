document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar máscaras de entrada
    setupInputMasks();

    // Inicializar validación de edad
    setupAgeValidation();

    // 1. Inicializar cliente de Supabase (Lado Cliente) - USA CONSTANTES DE config.js
    const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let userId = null;
    let initialized = false;

    // 2. FUNCIÓN DE INICIALIZACIÓN (Se activa cuando hay un ID de usuario)
    async function initForm(uId) {
        if (initialized || !uId) return;
        initialized = true;
        userId = uId;
        console.log("🚀 Inicializando formulario para el usuario:", userId);

        try {
            // Obtener token fresco de la sesión de Supabase o usar el de localStorage
            const { data: { session } } = await _supabase.auth.getSession();
            const token = session ? session.access_token : (localStorage.getItem('auth_token') || '');

            if (session && session.access_token) {
                localStorage.setItem('auth_token', session.access_token);
                if (session.refresh_token) localStorage.setItem('refresh_token', session.refresh_token);
            }

            const checkResp = await fetch(`${API_BASE_URL}/api/verificar_estado/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const checkData = await checkResp.json();

            if (checkData.completado) {
                document.querySelector('main').innerHTML = "";
                Swal.fire({
                    title: '¡Ya estás inscrito!',
                    text: 'Ya recibimos los datos de tu representado.',
                    icon: 'info',
                    confirmButtonText: 'Ir al Login',
                    confirmButtonColor: '#ec4899'
                }).then(() => { window.location.href = 'login.html'; });
                return;
            }
        } catch (error) {
            console.error("❌ Error en verificación de estado:", error);
        }

        updateUI();
    }

    // 3. CAPTURAR SESIÓN INICIAL Y ESCUCHAR CAMBIOS
    const checkSession = async () => {
        let { data: { session }, error } = await _supabase.auth.getSession();

        // RECUPERACIÓN INTELIGENTE: Si no hay sesión en Supabase pero venimos del login
        if (!session) {
            const authToken = localStorage.getItem('auth_token');
            const refreshToken = localStorage.getItem('refresh_token');
            if (authToken) {
                console.log("🔄 Restaurando sesión desde login previo...");
                const { data, error: setErr } = await _supabase.auth.setSession({
                    access_token: authToken,
                    refresh_token: refreshToken || ''
                });
                session = data.session;
                if (setErr) console.error("Error al restaurar sesión:", setErr);
            }
        }

        console.log("🔍 Verificando sesión inicial...", session ? "Sesión encontrada" : "Sin sesión");
        if (error) console.error("❌ Error de sesión:", error);

        if (session) {
            await initForm(session.user.id);
        } else {
            // Último recurso: si setSession falló pero existe user_id en localStorage
            const localUserId = localStorage.getItem('user_id');
            const localToken = localStorage.getItem('auth_token');
            if (localUserId && localToken) {
                console.log("⚠️ Forzando inicialización con datos de localStorage");
                await initForm(localUserId);
            }
        }
    };

    // LEER PARÁMETROS DE LA URL (search y hash) — deben declararse ANTES de todo
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));

    // DETECCIÓN DE ERRORES EN URL (ej: link de correo expirado)
    const urlError = hashParams.get('error_code') || urlParams.get('error_code');

    // --- CASO 1: INTERCEPTAR ENLACE EXPIRADO INMEDIATAMENTE ---
    if (urlError === 'otp_expired' || urlError === 'access_denied') {
        console.warn("❌ Error en URL de retorno:", urlError);
        document.querySelector('main').classList.add('hidden');

        // Bloquear y forzar al usuario a ir al login (incluso si tenía sesión, el link enviado ya no sirve)
        _supabase.auth.signOut().then(() => {
            Swal.fire({
                title: 'Enlace Expirado',
                html: 'Este enlace de verificación ya fue usado o ha caducado.<br>Por favor <b>inicia sesión</b> con tu correo y contraseña.',
                icon: 'warning',
                confirmButtonText: '🔑 Ir a Iniciar Sesión',
                confirmButtonColor: '#EC4899',
                allowOutsideClick: false,
                customClass: {
                    popup: 'rounded-2xl shadow-xl',
                    confirmButton: 'rounded-xl px-6 py-2 font-bold'
                }
            }).then(() => { window.location.href = 'login.html'; });
        });
        return; // Detenemos la ejecución aquí, no se inicializa el form
    }

    // Detectar si es una redirección de Auth (token o code en URL) válida
    const isAuthRedirect = window.location.hash.includes('access_token') || urlParams.has('code');

    if (isAuthRedirect) {
        console.log("🎫 Se detectó un token de verificación en la URL. Procesando...");
    }

    checkSession();

    _supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("🔔 Cambio en Autenticación:", event, session ? "Hay sesión" : "Sesión nula");
        if (session) {
            localStorage.setItem('auth_token', session.access_token);
            if (session.refresh_token) localStorage.setItem('refresh_token', session.refresh_token);
            await initForm(session.user.id);
        } else if (event === 'INITIAL_SESSION' && isAuthRedirect) {
            console.log("⏳ Reintentando captura de sesión...");
            setTimeout(checkSession, 1000);
        }
    });

    // GUARDIA DE ACCESO PARA ACCESOS DIRECTOS SIN SESIÓN
    setTimeout(() => {
        if (userId) return; // Ya hay sesión activa lograda, todo bien ✅

        const mainEl = document.querySelector('main');
        mainEl.classList.add('hidden'); // Ocultar el formulario

        // --- CASO 2: Acceso directo sin sesión (Abrió la página manualmente) ---
        if (!isAuthRedirect) {
            Swal.fire({
                title: 'Sesión Requerida',
                html: 'Debes <b>iniciar sesión</b> primero para poder completar la ficha de inscripción.',
                icon: 'info',
                confirmButtonText: '🔑 Ir a Iniciar Sesión',
                showCancelButton: true,
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#EC4899',
                cancelButtonColor: '#9ca3af',
                allowOutsideClick: false,
                customClass: {
                    popup: 'rounded-2xl shadow-xl',
                    confirmButton: 'rounded-xl px-6 py-2 font-bold',
                    cancelButton: 'rounded-xl px-6 py-2'
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = 'login.html';
                }
                // Si cancela, el formulario permanece oculto
            });

            // --- CASO 3: Vino de un link válido pero falló la sesión (PKCE error, navegador distinto) ---
        } else {
            Swal.fire({
                title: 'Error de Verificación',
                html: 'El enlace abrió incorrectamente (quizás en un navegador distinto).<br>Por favor <b>inicia sesión</b> directamente.',
                icon: 'error',
                confirmButtonText: '🔑 Ir a Iniciar Sesión',
                confirmButtonColor: '#EC4899',
                allowOutsideClick: false,
                customClass: {
                    popup: 'rounded-2xl shadow-xl',
                    confirmButton: 'rounded-xl px-6 py-2 font-bold'
                }
            }).then(() => { window.location.href = 'login.html'; });
        }
    }, 3000);

    let currentStep = 1;
    const totalSteps = 4;

    const form = document.getElementById('registrationForm');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const submitBtn = document.getElementById('submitBtn');
    const progressBar = document.getElementById('progress-bar');
    const stepIndicator = document.getElementById('step-indicator');

    // --- LÓGICA DE NAVEGACIÓN ---
    nextBtn.addEventListener('click', () => {
        if (validateStep(currentStep)) {
            currentStep++;
            updateUI();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateUI();
        }
    });

    // --- LÓGICA DE ENVÍ0 ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (validateStep(currentStep)) {
            if (!userId) {
                Swal.fire('❌ Sesión requerida', 'No se ha detectado una sesión válida. Por favor inicia sesión.', 'error');
                return;
            }

            const originalBtnContent = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Enviando...';
            submitBtn.disabled = true;

            // Si es local, esperamos 25 segundos máximo. Si es producción, le damos 60s
            // a Render para "despertar" de su sleep mode
            const esProduccion = API_BASE_URL.includes('onrender');
            const tiempoLimite = esProduccion ? 60000 : 25000;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                if (esProduccion) {
                    console.error('❌ Timeout: Render en producción no respondió en 60 segundos (pudo haber dormido tu cuenta gratuita). Vuelve a intentar.');
                } else {
                    console.error(`❌ Timeout: El servidor Flask LOCAL (${API_BASE_URL}) no finalizó en 25 segundos. Se quedó bloqueado procesando algo.`);
                }
            }, tiempoLimite);

            try {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                const conductas = formData.getAll('conducta[]');
                data['conducta'] = conductas;
                delete data['conducta[]'];

                data.bio_cesarea = formData.has('bio_cesarea');
                data.bio_prematuro = formData.has('bio_prematuro');
                data.bio_alergico = formData.has('bio_alergico');

                data.nino_edad = data.nino_edad ? parseInt(data.nino_edad) : null;
                data.bio_peso = data.bio_peso ? parseFloat(data.bio_peso) : null;
                data.bio_talla = data.bio_talla ? parseFloat(data.bio_talla) : null;

                // AGREGAR EL USER_ID AL JSON
                data.user_id = userId;

                // ⚠️ Bypassar el Supabase SDK (getSession) porque en ocasiones genera un 
                // deadlock en el navegador: "@supabase/gotrue-js: Lock was not released".
                // En su lugar, leemos directamente el token de la sesión previamente autorizada guardada
                const token = localStorage.getItem('auth_token') || sessionStorage.getItem('supabase.auth.token') || '';
                const tokenSource = token ? '✅ LocalStorage Directo' : '⚠️ Ninguno';

                const urlDestino = `${API_BASE_URL}/api/inscribir`;
                console.log('📤 Enviando inscripción...', {
                    userId,
                    tokenFuente: tokenSource,
                    tokenPresente: !!token,
                    tokenInicio: token ? token.substring(0, 30) + '...' : 'NINGUNO',
                    url: urlDestino
                });

                // ⚠️ Si no hay token real, abortar antes de enviar
                if (!token) {
                    throw new Error('No hay token de autenticación. Por favor inicia sesión nuevamente.');
                }

                const response = await fetch(urlDestino, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                console.log('📨 Respuesta del servidor:', response.status, response.statusText);


                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    // Backend puede devolver 'error' o 'message'
                    const mensaje = errorData.error || errorData.message || `Error HTTP ${response.status}`;
                    throw new Error(mensaje);
                }

                const resultData = await response.json();
                console.log('✅ Inscripción exitosa:', resultData);

                Swal.fire({
                    title: '¡Inscripción Exitosa!',
                    text: 'Los datos del estudiante han sido registrados correctamente.',
                    icon: 'success',
                    confirmButtonText: 'Ir a Iniciar Sesión',
                    allowOutsideClick: false,
                    confirmButtonColor: '#ec4899',
                    background: '#ffffff',
                    color: '#374151',
                    iconColor: '#10b981',
                    backdrop: `rgba(236, 72, 153, 0.1) left top no-repeat`,
                    customClass: {
                        popup: 'rounded-2xl shadow-2xl',
                        confirmButton: 'rounded-xl px-6 py-3 font-bold text-lg'
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        window.location.href = 'login.html';
                    }
                });

            } catch (error) {
                clearTimeout(timeoutId);
                console.error('❌ Error al enviar formulario:', error);

                // Mensaje especial si fue timeout (AbortError)
                const mensaje = error.name === 'AbortError'
                    ? 'La solicitud tardó demasiado. Verifica tu conexión e inténtalo de nuevo.'
                    : error.message;

                Swal.fire({
                    title: 'Hubo un problema',
                    text: mensaje,
                    icon: 'error',
                    confirmButtonColor: '#ef4444',
                    confirmButtonText: 'Intentar de nuevo',
                    customClass: { popup: 'rounded-2xl' }
                });

                submitBtn.innerHTML = originalBtnContent;
                submitBtn.disabled = false;
            }
        }
    });


    function updateUI() {
        document.querySelectorAll('.step-content').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('fade-in');
        });

        const currentEl = document.getElementById(`step-${currentStep}`);
        if (currentEl) {
            currentEl.classList.remove('hidden');
            void currentEl.offsetWidth;
            currentEl.classList.add('fade-in');
        }

        const percent = (currentStep / totalSteps) * 100;
        progressBar.style.width = `${percent}%`;
        stepIndicator.textContent = `Paso ${currentStep} de ${totalSteps}`;

        prevBtn.classList.toggle('hidden', currentStep === 1);

        if (currentStep === totalSteps) {
            nextBtn.classList.add('hidden');
            submitBtn.classList.remove('hidden');
        } else {
            nextBtn.classList.remove('hidden');
            submitBtn.classList.add('hidden');
        }

        if (window.innerWidth < 768) {
            document.querySelector('main').scrollIntoView({ behavior: 'smooth' });
        }
    }

    function validateStep(step) {
        const currentEl = document.getElementById(`step-${step}`);
        const inputs = currentEl.querySelectorAll('input[required], select[required], textarea[required]');
        let valid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                valid = false;
                input.classList.add('border-red-500', 'bg-red-50');
                input.addEventListener('input', () => {
                    input.classList.remove('border-red-500', 'bg-red-50');
                }, { once: true });
            }
        });

        if (!valid) {
            currentEl.animate([
                { transform: 'translateX(0)' },
                { transform: 'translateX(-5px)' },
                { transform: 'translateX(5px)' },
                { transform: 'translateX(0)' }
            ], { duration: 300 });
        }
        return valid;
    }

    /**
     * Configura restricciones de entrada para evitar números en nombres 
     * y letras en campos numéricos.
     */
    function setupInputMasks() {
        // --- CAMPOS DE SOLO TEXTO (Bloquear números) ---
        const textFields = [
            'nino_nombres',
            'nino_apellidos',
            'nino_lugar_nac',
            'madre_nombre',
            'madre_ocupacion',
            'padre_nombre',
            'salud_fiebre'
        ];

        textFields.forEach(name => {
            const input = document.querySelector(`[name="${name}"]`);
            if (input) {
                input.addEventListener('input', function() {
                    // Solo permitimos letras, espacios y acentos
                    this.value = this.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g, '');
                });
            }
        });

        // --- CAMPOS DE SOLO NÚMEROS (Bloquear texto) ---
        const numberFields = [
            'madre_ci',
            'madre_telefono',
            'padre_telefono'
        ];

        numberFields.forEach(name => {
            const input = document.querySelector(`[name="${name}"]`);
            if (input) {
                input.addEventListener('input', function() {
                    // Solo permitimos dígitos
                    this.value = this.value.replace(/[^0-9]/g, '');
                });
            }
        });

        // --- CAMPOS DECIMALES (Peso y Talla) ---
        const decimalFields = [
            'bio_peso',
            'bio_talla'
        ];

        decimalFields.forEach(name => {
            const input = document.querySelector(`[name="${name}"]`);
            if (input) {
                input.addEventListener('input', function() {
                    // Permitimos dígitos y un punto decimal
                    this.value = this.value.replace(/[^0-9.]/g, '');
                    
                    // Evitar más de un punto
                    const parts = this.value.split('.');
                    if (parts.length > 2) {
                        this.value = parts[0] + '.' + parts.slice(1).join('');
                    }
                });
            }
        });
    }

    /**
     * Valida la edad del niño en tiempo real (debe ser entre 2 y 6 años)
     * También auto-completa el campo de edad.
     */
    function setupAgeValidation() {
        const inputFecha = document.getElementById('nino_fecha_nacimiento');
        const inputEdad = document.getElementById('nino_edad');
        const msgValidacion = document.getElementById('msg-validacion-edad');
        const nextBtn = document.getElementById('nextBtn');

        if (!inputFecha || !msgValidacion) return;

        inputFecha.addEventListener('input', () => {
            const value = inputFecha.value;
            if (!value) {
                msgValidacion.classList.add('opacity-0', '-translate-y-1');
                inputFecha.classList.remove('border-emerald-500', 'border-red-500');
                if (inputEdad) inputEdad.value = "";
                if (nextBtn) nextBtn.disabled = false;
                return;
            }

            const fechaNac = new Date(value);
            const hoy = new Date();
            
            let edad = hoy.getFullYear() - fechaNac.getFullYear();
            const m = hoy.getMonth() - fechaNac.getMonth();
            if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) {
                edad--;
            }

            if (inputEdad) inputEdad.value = edad;

            msgValidacion.classList.remove('opacity-0', '-translate-y-1');
            msgValidacion.classList.add('opacity-100', 'translate-y-0');

            if (edad >= 2 && edad <= 6) {
                msgValidacion.innerText = `✅ Edad permitida preescolar: ${edad} años`;
                msgValidacion.className = "text-[10px] font-bold mt-1.5 ml-1 transition-all duration-300 opacity-100 translate-y-0 text-emerald-500";
                inputFecha.classList.remove('border-gray-300', 'border-red-500');
                inputFecha.classList.add('border-emerald-500');
                if (nextBtn) nextBtn.disabled = false;
            } else {
                const motivo = edad < 2 ? "(El ingreso es desde los 2 años)" : "(Excede la edad preescolar)";
                msgValidacion.innerText = `❌ Edad no permitida: ${edad} años ${motivo}`;
                msgValidacion.className = "text-[10px] font-bold mt-1.5 ml-1 transition-all duration-300 opacity-100 translate-y-0 text-red-500";
                inputFecha.classList.remove('border-gray-300', 'border-emerald-500');
                inputFecha.classList.add('border-red-500');
                // Bloqueamos la navegación al siguiente paso
                if (nextBtn) nextBtn.disabled = true;
            }
        });
    }
});
