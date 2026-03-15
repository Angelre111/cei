// ==========================================
// FUNCIONES DE INTERFAZ (UI) PARA EL SWITCH
// ==========================================

// Cambia la palabra "Ausente" a "Presente" y su color cuando tocan el switch
function cambiarTextoSwitch(checkbox, id) {
    const label = document.getElementById(`label-estado-${id}`);
    const justificativoWrapper = document.getElementById(`justificativo-wrapper-${id}`);
    const obsContainer = document.getElementById(`obs-container-${id}`);
    const obsInput = document.getElementById(`observacion-${id}`);
    
    if (checkbox.checked) {
        // --- ESTADO: PRESENTE ---
        label.innerText = 'Presente';
        label.classList.remove('text-gray-400');
        label.classList.add('text-green-600');
        
        // Ocultar la zona de justificativo
        justificativoWrapper.classList.remove('flex');
        justificativoWrapper.classList.add('hidden');
        
        // Si había dejado el cuadro de texto abierto, lo cerramos y limpiamos
        obsContainer.classList.add('hidden');
        obsInput.value = ''; 
    } else {
        // --- ESTADO: AUSENTE ---
        label.innerText = 'Ausente';
        label.classList.remove('text-green-600');
        label.classList.add('text-gray-400');
        
        // Mostrar la zona de justificativo
        justificativoWrapper.classList.remove('hidden');
        justificativoWrapper.classList.add('flex');
    }

    // (Al final de la función cambiarTextoSwitch)
    if (typeof actualizarContadoresAsistencia === 'function') {
        actualizarContadoresAsistencia();
    }
}

// Muestra u oculta el campo de texto del justificativo
function toggleObservacion(id) {
    const container = document.getElementById(`obs-container-${id}`);
    container.classList.toggle('hidden');
}


// ==========================================
// FUNCIÓN PRINCIPAL: GUARDAR ASISTENCIA API
// ==========================================

// Función auxiliar para enviar al backend (para no repetir código)
async function enviarDatosAsistencia(payload, btnSave, originalText) {
    btnSave.innerHTML = '<i class="ph-spinner animate-spin mr-2"></i> Guardando...';
    btnSave.disabled = true;

    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const response = await fetch(`${baseUrl}/api/asistencias/guardar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            Swal.fire({
                title: '¡Guardado!',
                text: 'La asistencia se registró correctamente.',
                icon: 'success',
                confirmButtonColor: '#EC4899',
                customClass: { popup: 'rounded-3xl' }
            });
            asistenciaYaRegistrada = true; // Actualizamos el estado local
        } else {
            Swal.fire({
                title: 'Error',
                text: result.message || 'No se pudo guardar la asistencia.',
                icon: 'error',
                confirmButtonColor: '#EF4444',
                customClass: { popup: 'rounded-3xl' }
            });
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            title: 'Error de Red',
            text: 'Verifica tu conexión y vuelve a intentarlo.',
            icon: 'error',
            confirmButtonColor: '#EF4444',
            customClass: { popup: 'rounded-3xl' }
        });
    } finally {
        btnSave.innerHTML = originalText;
        btnSave.disabled = false;
    }
}

// Listener del botón
document.getElementById('btn-save-attendance').addEventListener('click', async () => {
    const fechaInput = document.getElementById('attendance-date').value;
    // seccionActivaId debe estar disponible globalmente o vía localStorage
    const seccionId = localStorage.getItem('seccion_activa_id');

    if (!fechaInput || !seccionId) {
        Swal.fire({
            title: 'Atención',
            text: 'Selecciona la fecha para registrar la asistencia.',
            icon: 'warning',
            confirmButtonColor: '#EC4899',
            customClass: { popup: 'rounded-3xl' }
        });
        return;
    }

    const estudiantesData = [];
    document.querySelectorAll('.student-attendance-row').forEach(fila => {
        const checkbox = fila.querySelector('.asistencia-checkbox');
        const obsInput = fila.querySelector('.observacion-input');
        
        estudiantesData.push({
            hijo_id: parseInt(checkbox.dataset.hijoId),
            estado_asistencia: checkbox.checked ? 'presente' : 'ausente',
            observacion: obsInput.value.trim() !== "" ? obsInput.value.trim() : null
        });
    });

    const payload = {
        fecha: fechaInput,
        seccion_id: seccionId,
        estudiantes: estudiantesData
    };

    const btnSave = document.getElementById('btn-save-attendance');
    const originalText = btnSave.innerHTML;

    // LÓGICA DE CONFIRMACIÓN SI YA EXISTE REGISTRO
    if (typeof asistenciaYaRegistrada !== 'undefined' && asistenciaYaRegistrada) {
        Swal.fire({
            title: '¿Actualizar Registro?',
            text: `Ya habías guardado la asistencia para el día ${fechaInput}. ¿Estás segura de que deseas sobrescribir los datos?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#EC4899',
            cancelButtonColor: '#9CA3AF',
            confirmButtonText: 'Sí, actualizar',
            cancelButtonText: 'Cancelar',
            customClass: { popup: 'rounded-3xl' }
        }).then((result) => {
            if (result.isConfirmed) {
                enviarDatosAsistencia(payload, btnSave, originalText);
            }
        });
    } else {
        // Si es la primera vez del día, guardamos directo
        enviarDatosAsistencia(payload, btnSave, originalText);
    }
});
