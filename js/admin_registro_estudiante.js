// ============================================
// MODAL REGISTRO COMPLETO DE ESTUDIANTE
// ============================================

async function abrirModalRegistrarNuevoEstudiante() {
    // Limpiar formulario
    const form = document.getElementById('form-nuevo-estudiante');
    if (form) form.reset();
    // Limpiar checks de conducta
    document.querySelectorAll('#form-nuevo-estudiante .conducta-check').forEach(cb => cb.checked = false);

    // Resetear validación de edad
    const msgValidacion = document.getElementById('msg-validacion-edad');
    const inputFecha = document.getElementById('nuevo_nino_fecha_nacimiento');
    const btnSubmit = document.getElementById('btn-enviar-nuevo-estudiante');
    if (msgValidacion) msgValidacion.classList.add('opacity-0', '-translate-y-1');
    if (inputFecha) inputFecha.classList.remove('border-emerald-400', 'border-red-400', 'focus:ring-red-100');
    if (btnSubmit) btnSubmit.disabled = false;

    // Abrir el modal INMEDIATAMENTE para evitar retraso visual
    const modal = document.getElementById('modal-registrar-nuevo-estudiante');
    const content = document.getElementById('modal-registrar-nuevo-estudiante-content');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);

    // Cargar secciones disponibles en segundo plano
    cargarSeccionesNuevoEstudiante();
}

function cerrarModalRegistrarNuevoEstudiante() {
    const modal = document.getElementById('modal-registrar-nuevo-estudiante');
    const content = document.getElementById('modal-registrar-nuevo-estudiante-content');
    if (!modal || !content) return;
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function cargarSeccionesNuevoEstudiante() {
    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/secciones/disponibles`);
        const data = await res.json();
        const select = document.getElementById('nuevo_seccion_id');
        if (!select) return;
        if (res.ok && data.success && data.secciones && data.secciones.length > 0) {
            select.innerHTML = '<option value="">-- Sin asignar --</option>';
            data.secciones.forEach(sec => {
                select.innerHTML += `<option value="${sec.id}">${sec.nivel} - ${sec.letra} (Cap. ${sec.capacidad_maxima})</option>`;
            });
        } else {
            select.innerHTML = '<option value="">-- Sin asignar --</option>';
        }
    } catch (err) {
        console.error("Error cargando secciones:", err);
        const select = document.getElementById('nuevo_seccion_id');
        if (select) select.innerHTML = '<option value="">-- Sin asignar --</option>';
    }
}

// ── Adjuntar listener cuando el DOM esté listo ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar máscaras de entrada para evitar números en texto y viceversa
    setupInputMasks();

    const form = document.getElementById('form-nuevo-estudiante');
    if (!form) {
        console.error('[admin_registro_estudiante] No se encontró #form-nuevo-estudiante en el DOM.');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const btn = document.getElementById('btn-enviar-nuevo-estudiante');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Procesando...'; }

        // Recolectar datos — nombres alineados con /api/admin/registrar_estudiante
        const payload = {
            nombre:             document.getElementById('nuevo_nino_nombres')?.value.trim() ?? '',
            apellidos:          document.getElementById('nuevo_nino_apellidos')?.value.trim() ?? '',
            fecha_nacimiento:   document.getElementById('nuevo_nino_fecha_nacimiento')?.value ?? '',
            sexo:               document.getElementById('nuevo_nino_sexo')?.value ?? '',
            lugar_nacimiento:   document.getElementById('nuevo_nino_lugar_nac')?.value.trim() ?? '',
            direccion:          document.getElementById('nuevo_nino_direccion')?.value.trim() ?? '',

            // Representante
            email_representante: document.getElementById('nuevo_representante_email')?.value.trim().toLowerCase() ?? '',
            ci_representante:    document.getElementById('nuevo_madre_ci')?.value.trim() ?? '',

            // Sección (opcional)
            seccion_id: document.getElementById('nuevo_seccion_id')?.value || null,

            // Datos familiares
            madre_nombre:    document.getElementById('nuevo_madre_nombre')?.value.trim() ?? '',
            madre_telefono:  document.getElementById('nuevo_madre_telefono')?.value.trim() ?? '',
            madre_ocupacion: document.getElementById('nuevo_madre_ocupacion')?.value.trim() ?? '',
            padre_nombre:    document.getElementById('nuevo_padre_nombre')?.value.trim() ?? '',
            padre_telefono:  document.getElementById('nuevo_padre_telefono')?.value.trim() ?? '',
            vivienda_tipo:   document.getElementById('nuevo_vivienda_tipo')?.value ?? '',
            vivienda_tenencia: document.getElementById('nuevo_vivienda_tenencia')?.value ?? '',

            // Salud
            bio_cesarea:  document.getElementById('nuevo_bio_cesarea')?.checked ?? false,
            bio_prematuro: document.getElementById('nuevo_bio_prematuro')?.checked ?? false,
            bio_alergico: document.getElementById('nuevo_bio_alergico')?.checked ?? false,
            bio_peso:     document.getElementById('nuevo_bio_peso')?.value.trim() ?? '',
            bio_talla:    document.getElementById('nuevo_bio_talla')?.value.trim() ?? '',
            salud_enfermedad: document.getElementById('nuevo_salud_enfermedad')?.value.trim() ?? '',
            salud_fiebre:     document.getElementById('nuevo_salud_fiebre')?.value.trim() ?? '',

            // Hábitos y conducta
            habito_come: document.getElementById('nuevo_habito_come')?.value ?? '',
            habito_hora: document.getElementById('nuevo_habito_hora')?.value ?? '',
            conducta: Array.from(
                document.querySelectorAll('#form-nuevo-estudiante .conducta-check:checked')
            ).map(cb => cb.value),
        };

        // Validaciones básicas
        if (!payload.nombre || !payload.apellidos || !payload.fecha_nacimiento ||
            !payload.sexo || !payload.email_representante) {
            Swal.fire('Campos incompletos',
                'Por favor completa los campos obligatorios: Nombres, Apellidos, Fecha de nacimiento, Sexo y Correo del representante.',
                'warning');
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }

        if (!payload.ci_representante) {
            Swal.fire('Cédula requerida',
                'La cédula de la madre es necesaria para generar la matrícula del estudiante.',
                'warning');
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/registrar_estudiante`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                const cedula = data.cedula_escolar ? ` — Cédula: ${data.cedula_escolar}` : '';
                Swal.fire({
                    icon: 'success',
                    title: '¡Estudiante Registrado!',
                    text: (data.message || 'Registro exitoso.') + cedula,
                });
                cerrarModalRegistrarNuevoEstudiante();
                if (typeof cargarMatriculaGeneral === 'function') cargarMatriculaGeneral();
            } else {
                Swal.fire('Error', data.message || 'No se pudo registrar el estudiante.', 'error');
            }
        } catch (err) {
            console.error('[admin_registro_estudiante] Error de red:', err);
            Swal.fire('Error de red', 'No se pudo conectar con el servidor. Verifica que el backend está corriendo.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        }
    });

    console.log('[admin_registro_estudiante] ✅ Listener de submit adjuntado al formulario.');
});

/**
 * Configura restricciones de entrada para evitar números en nombres 
 * y letras en campos numéricos en todos los modales de estudiantes.
 */
function setupInputMasks() {
    // Helper para aplicar máscara por ID
    const restrict = (id, regex, isDecimal = false) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', function() {
            this.value = this.value.replace(regex, '');
            if (isDecimal) {
                const parts = this.value.split('.');
                if (parts.length > 2) this.value = parts[0] + '.' + parts.slice(1).join('');
            }
        });
    };

    // Regex patterns
    const regexSoloTexto = /[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g;
    const regexSoloNumeros = /[^0-9]/g;
    const regexDecimal = /[^0-9.]/g;

    // --- MODAL: REGISTRO NUEVO ESTUDIANTE ---
    const textFieldsNuevo = [
        'nuevo_nino_nombres', 'nuevo_nino_apellidos', 'nuevo_nino_lugar_nac',
        'nuevo_madre_nombre', 'nuevo_madre_ocupacion', 'nuevo_padre_nombre',
        'nuevo_salud_fiebre'
    ];
    textFieldsNuevo.forEach(id => restrict(id, regexSoloTexto));

    const numFieldsNuevo = [
        'nuevo_madre_ci', 'nuevo_madre_telefono', 'nuevo_padre_telefono', 'student-cedula'
    ];
    numFieldsNuevo.forEach(id => restrict(id, regexSoloNumeros));

    restrict('nuevo_bio_peso', regexDecimal, true);
    restrict('nuevo_bio_talla', regexDecimal, true);

    // --- MODAL: FICHA MASTER (EDICIÓN) ---
    const textFieldsFicha = [
        'f-nombres', 'f-apellidos', 'f-madre-nombre', 'f-padre-nombre', 'f-fiebre'
    ];
    textFieldsFicha.forEach(id => restrict(id, regexSoloTexto));

    const numFieldsFicha = [
        'f-madre-ci', 'f-madre-tel', 'f-padre-tel'
    ];
    numFieldsFicha.forEach(id => restrict(id, regexSoloNumeros));

    // --- VALIDACIÓN DE EDAD REAL-TIME ---
    setupAgeValidation();
}

/**
 * Valida la edad del niño en tiempo real (debe ser entre 2 y 6 años)
 */
function setupAgeValidation() {
    const inputFecha = document.getElementById('nuevo_nino_fecha_nacimiento');
    const msgValidacion = document.getElementById('msg-validacion-edad');
    const btnSubmit = document.getElementById('btn-enviar-nuevo-estudiante');

    if (!inputFecha || !msgValidacion) return;

    inputFecha.addEventListener('input', () => {
        const value = inputFecha.value;
        if (!value) {
            msgValidacion.classList.add('opacity-0', '-translate-y-1');
            inputFecha.classList.remove('border-emerald-400', 'border-red-400', 'ring-red-100');
            if (btnSubmit) btnSubmit.disabled = false;
            return;
        }

        const fechaNac = new Date(value);
        const hoy = new Date();
        
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const m = hoy.getMonth() - fechaNac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) {
            edad--;
        }

        msgValidacion.classList.remove('opacity-0', '-translate-y-1');
        msgValidacion.classList.add('opacity-100', 'translate-y-0');

        if (edad >= 2 && edad <= 6) {
            msgValidacion.innerText = `✅ Edad permitida: ${edad} años`;
            msgValidacion.className = "text-[10px] font-bold mt-1 ml-1 transition-all duration-300 opacity-100 translate-y-0 text-emerald-500";
            inputFecha.classList.remove('border-gray-100', 'border-red-400', 'focus:ring-red-100');
            inputFecha.classList.add('border-emerald-400', 'focus:ring-emerald-100');
            if (btnSubmit) btnSubmit.disabled = false;
        } else {
            const motivo = edad < 2 ? "(Mínimo 2 años)" : "(Máximo 6 años)";
            msgValidacion.innerText = `❌ Edad no permitida: ${edad} años ${motivo}`;
            msgValidacion.className = "text-[10px] font-bold mt-1 ml-1 transition-all duration-300 opacity-100 translate-y-0 text-red-500";
            inputFecha.classList.remove('border-gray-100', 'border-emerald-400', 'focus:ring-emerald-100');
            inputFecha.classList.add('border-red-400', 'focus:ring-red-100');
            if (btnSubmit) btnSubmit.disabled = true;
        }
    });
}