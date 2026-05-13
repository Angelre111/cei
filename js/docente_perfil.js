/**
 * SISTEMA DE GESTIÓN ESCOLAR - MÓDULO PERFIL DEL DOCENTE
 * Lógica para cargar y actualizar los datos profesionales y tallas con modo edición.
 */

// ==========================================
// MODO EDICIÓN – Alternar bloqueo de campos
// ==========================================
function toggleEditMode(enabled) {
    const inputs = document.querySelectorAll('.perfil-input');
    const saveContainer = document.getElementById('container-guardar-perfil');
    const btnEditar = document.getElementById('btn-editar-perfil');

    if (!btnEditar) return;

    inputs.forEach(input => {
        input.disabled = !enabled;
    });

    if (enabled) {
        if (saveContainer) saveContainer.classList.remove('hidden');
        btnEditar.innerHTML = '<i class="ph-bold ph-x text-lg"></i> Cancelar Edición';
        btnEditar.classList.replace('text-pink-600', 'text-slate-500');
        btnEditar.classList.replace('border-pink-100', 'border-slate-200');
    } else {
        if (saveContainer) saveContainer.classList.add('hidden');
        btnEditar.innerHTML = '<i class="ph-bold ph-pencil-simple text-lg"></i> Editar Perfil';
        btnEditar.classList.replace('text-slate-500', 'text-pink-600');
        btnEditar.classList.replace('border-slate-200', 'border-pink-100');
    }
}

// ==========================================
// PERFIL – Cargar datos iniciales
// ==========================================
async function cargarPerfil() {
    const token = localStorage.getItem('auth_token');
    const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';

    try {
        const res = await fetch(`${baseUrl}/api/mi_perfil`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.ok && data.success) {
            // Llenar campos de solo lectura
            document.getElementById('perfil-nombres').value = data.nombres || '';
            document.getElementById('perfil-apellidos').value = data.apellidos || '';
            document.getElementById('perfil-email').value = data.email || '';
            document.getElementById('perfil-rol').value = data.rol || '';

            // Llenar campos editables
            document.getElementById('perfil-fecha-nacimiento').value = data.fecha_nacimiento || '';
            document.getElementById('perfil-codigo-cargo').value = data.codigo_cargo || '';
            document.getElementById('perfil-tipo-cargo').value = data.tipo_cargo || '';
            document.getElementById('perfil-talla-zapato').value = data.talla_zapato || '';
            document.getElementById('perfil-talla-camisa').value = data.talla_camisa || '';
            document.getElementById('perfil-talla-pantalon').value = data.talla_pantalon || '';

            // Mostrar badge de estado del perfil
            const badge = document.getElementById('perfil-status-badge');
            if (badge) {
                if (data.perfil_completado) {
                    badge.classList.remove('hidden', 'bg-amber-50', 'border-amber-200', 'text-amber-700');
                    badge.classList.add('flex', 'bg-green-50', 'border-green-200', 'text-green-700');
                    document.getElementById('perfil-status-text').innerText = 'Perfil completo ✓';
                } else {
                    badge.classList.remove('hidden', 'bg-green-50', 'border-green-200', 'text-green-700');
                    badge.classList.add('flex', 'bg-amber-50', 'border-amber-200', 'text-amber-700');
                    document.getElementById('perfil-status-text').innerText = 'Perfil incompleto – completa tus datos';
                }
            }
            
            // Siempre cargar en modo lectura al inicio
            toggleEditMode(false);
        } else {
            console.error('Error al cargar perfil:', data.message);
        }
    } catch (err) {
        console.error('Error de conexión:', err);
    }
}

// ==========================================
// PERFIL – Inicializar eventos
// ==========================================
const initPerfilEvents = () => {
    const form = document.getElementById('form-perfil');
    const btnEditar = document.getElementById('btn-editar-perfil');
    
    if (!form || !btnEditar) return;

    // Botón Editar Toggle
    btnEditar.addEventListener('click', () => {
        const codigoCargoInput = document.getElementById('perfil-codigo-cargo');
        if (!codigoCargoInput) return;
        
        const isEditing = !codigoCargoInput.disabled;
        if (isEditing) {
            // Si estaba editando y cancela, recargamos para revertir cambios no guardados y bloqueamos
            cargarPerfil();
        } else {
            toggleEditMode(true);
        }
    });

    // Envío del Formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('btn-guardar-perfil');
        if (!btn) return;
        
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin text-lg"></i> Guardando...';

        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';

        const payload = {
            fecha_nacimiento: document.getElementById('perfil-fecha-nacimiento').value,
            codigo_cargo: document.getElementById('perfil-codigo-cargo').value.toUpperCase(),
            tipo_cargo: document.getElementById('perfil-tipo-cargo').value.trim(),
            talla_zapato: document.getElementById('perfil-talla-zapato').value,
            talla_camisa: document.getElementById('perfil-talla-camisa').value,
            talla_pantalon: document.getElementById('perfil-talla-pantalon').value
        };

        try {
            const res = await fetch(`${baseUrl}/api/perfil`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                Swal.fire({
                    title: '¡Guardado!',
                    text: 'Tu perfil se ha actualizado correctamente.',
                    icon: 'success',
                    confirmButtonColor: '#EC4899',
                    customClass: { popup: 'rounded-3xl' }
                });
                // Recargar perfil para actualizar badge y bloquear campos
                cargarPerfil();
            } else {
                Swal.fire('Error', data.message || 'No se pudo guardar.', 'error');
            }
        } catch (err) {
            Swal.fire('Error de Red', 'No se pudo conectar con el servidor.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    });
};

// Cargar perfil cuando se muestre la sección
document.addEventListener('DOMContentLoaded', () => {
    initPerfilEvents();
    
    const perfilSection = document.getElementById('section-perfil');
    if (!perfilSection) return;

    let perfilLoaded = false;

    const perfilObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.attributeName === 'class' && 
                !perfilSection.classList.contains('hidden')) {
                // Recargar al mostrar la sección para asegurar datos frescos y resetear modo edición
                cargarPerfil();
            }
        });
    });
    
    perfilObserver.observe(perfilSection, { attributes: true });
});
