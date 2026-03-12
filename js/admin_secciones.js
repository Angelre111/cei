// =============================================================
// MÓDULO: GESTIÓN DE SECCIONES
// =============================================================

let seccionesCache = [];
let periodosCacheSecciones = [];
let docentesCache = [];
let currentTabSecciones = 'activo';

// =============================================================
// MODAL SECCIONES
// =============================================================

function abrirModalCrearSeccion() {
    const modal = document.getElementById('modal-crear-seccion');
    const content = document.getElementById('modal-crear-seccion-content');

    // Resetear form
    document.getElementById('seccion-id').value = '';
    document.getElementById('seccion-capacidad').value = '30';
    document.getElementById('seccion-nivel').selectedIndex = 0;
    document.getElementById('seccion-letra').selectedIndex = 0;

    // Limpiar docentes y colocar un select vacío por defecto
    const container = document.getElementById('seccion-docentes-container');
    container.innerHTML = '';
    agregarSelectDocente();

    // Si hay períodos, seleccionar el activo por defecto
    const selectP = document.getElementById('seccion-periodo');
    if (selectP.options.length > 0) {
        // Intentar seleccionar el activo, o el primero
        const pActivo = periodosCacheSecciones.find(p => p.estado === 'activo');
        selectP.value = pActivo ? pActivo.id : selectP.options[0].value;
    }

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

function cerrarModalCrearSeccion() {
    const modal = document.getElementById('modal-crear-seccion');
    const content = document.getElementById('modal-crear-seccion-content');
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }, 300);
}

document.addEventListener('click', (e) => {
    const modal = document.getElementById('modal-crear-seccion');
    if (modal && !modal.classList.contains('hidden') && e.target === modal) {
        cerrarModalCrearSeccion();
    }
});

// Cerrar modal con tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('modal-crear-seccion');
        if (modal && !modal.classList.contains('hidden')) {
            cerrarModalCrearSeccion();
        }
    }
});

// =============================================================
// MANEJO DE MÚLTIPLES DOCENTES
// =============================================================

function agregarSelectDocente() {
    const container = document.getElementById('seccion-docentes-container');
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 animate-fade-in';

    const options = '<option value="">Sin asignar (Opcional)</option>' +
        docentesCache.map(d => `<option value="${d.id}">${d.nombres} ${d.apellidos}</option>`).join('');

    div.innerHTML = `
        <select class="seccion-docente-select w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition-all bg-gray-50 focus:bg-white text-sm">
            ${options}
        </select>
        <button type="button" onclick="this.parentElement.remove()" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Quitar docente">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
    `;
    container.appendChild(div);
}

// =============================================================
// CARGA DE DATOS PARA SELECTS (Períodos y Docentes)
// =============================================================

async function cargarSelectsSecciones() {
    // 1. Cargar Períodos
    try {
        const resP = await fetchWithAuth(`${API_BASE}/api/periodos`);
        const dataP = await resP.json();
        if (resP.ok && dataP.periodos) {
            periodosCacheSecciones = dataP.periodos.filter(p => p.estado !== 'finalizado'); // Ocultar finalizados para crear sección
            const pSelect = document.getElementById('seccion-periodo');

            if (periodosCacheSecciones.length === 0) {
                pSelect.innerHTML = '<option value="">No hay períodos activos/en planif</option>';
            } else {
                pSelect.innerHTML = periodosCacheSecciones.map(p =>
                    `<option value="${p.id}">${p.nombre} (${p.estado})</option>`
                ).join('');
            }
        }
    } catch (e) { console.error('Error cargando períodos:', e); }

    // 2. Cargar Docentes
    try {
        const resD = await fetchWithAuth(`${API_BASE}/api/usuarios`);
        const dataD = await resD.json();
        if (resD.ok && dataD.usuarios) {
            docentesCache = dataD.usuarios.filter(u => u.rol === 'docente');
        }
    } catch (e) { console.error('Error cargando docentes:', e); }
}


// =============================================================
// CRUD — LEER SECCIONES
// =============================================================

async function cargarSecciones() {
    const tbody = document.getElementById('student-table-body'); // Espera, la tabla de secciones usa otro id... 
    // Wait, let's inject a proper ID if it doesn't exist, but checking admin.html, what is the ID of the tbody? 
    // In admin.html currently it doesn't have an ID for the tbody in sections. I will need to replace that or find it via css.
    // wait, I can just do document.querySelector('#section-secciones tbody'). Let's use that.
    const tabla = document.querySelector('#section-secciones tbody');
    if (!tabla) return;

    tabla.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-400">Cargando secciones...</td></tr>`;

    try {
        const res = await fetchWithAuth(`${API_BASE}/api/secciones`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Error al obtener secciones');

        seccionesCache = json.secciones || [];
        filtrarSeccionesTab(currentTabSecciones);
    } catch (err) {
        tabla.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-500">${err.message}</td></tr>`;
    }
}

function filtrarSeccionesTab(estado) {
    currentTabSecciones = estado;
    
    // Actualizar UI de los botones
    const btnActivo = document.getElementById('btn-sec-tab-activo');
    const btnPlanificacion = document.getElementById('btn-sec-tab-planificacion');
    const btnFinalizado = document.getElementById('btn-sec-tab-finalizado');

    if (!btnActivo || !btnPlanificacion || !btnFinalizado) return;

    // Resetear estilos
    [btnActivo, btnPlanificacion, btnFinalizado].forEach(btn => {
        btn.classList.remove('bg-white', 'shadow', 'text-gray-800');
        btn.classList.add('text-gray-500');
    });

    // Aplicar estilos al activo
    let btnActivoRef = null;
    if (estado === 'activo') btnActivoRef = btnActivo;
    else if (estado === 'planificacion') btnActivoRef = btnPlanificacion;
    else if (estado === 'finalizado') btnActivoRef = btnFinalizado;

    if (btnActivoRef) {
        btnActivoRef.classList.remove('text-gray-500');
        btnActivoRef.classList.add('bg-white', 'shadow', 'text-gray-800');
    }

    // Filtrar cache
    const seccionesFiltradas = seccionesCache.filter(s => {
        // Asumiendo que ahora recibiremos periodo_estado del backend
        const sEstado = s.periodo_estado ? s.periodo_estado.toLowerCase() : 'desconocido';
        return sEstado === estado;
    });

    const tabla = document.querySelector('#section-secciones tbody');
    if (tabla) {
        renderTablaSecciones(seccionesFiltradas, tabla);
    }
}

function renderTablaSecciones(secciones, tbody) {
    if (!secciones.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-400 text-sm">No hay secciones registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = secciones.map(s => {
        const docName = (s.docentes && s.docentes.length > 0)
            ? s.docentes.map(d => `<span class="inline-block px-2 py-0.5 bg-gray-100 rounded-lg text-xs font-medium mr-1 mb-1">${d.nombre_completo}</span>`).join('')
            : '<span class="text-gray-400 italic">Sin Asignar</span>';

        // Determinar color del status dot basado en el estado
        const estado = s.periodo_estado ? s.periodo_estado.toLowerCase() : 'desconocido';
        let statusDotColor = 'bg-gray-400'; // Default / Finalizado
        if (estado === 'activo') statusDotColor = 'bg-green-500';
        else if (estado === 'planificacion') statusDotColor = 'bg-yellow-400';

        return `
        <tr class="hover:bg-gray-50 transition-colors group">
            <td class="px-6 py-4 text-sm font-medium text-gray-800">${s.periodo_nombre}</td>
            <td class="px-6 py-4 text-sm text-gray-600"><span class="px-2 py-1 rounded bg-blue-100 text-blue-700 font-semibold text-xs">${s.nivel}</span></td>
            <td class="px-6 py-4 font-semibold text-gray-800 flex items-center gap-2">
                <span class="inset-y-0 flex items-center"><span class="w-2 h-2 rounded-full ${statusDotColor}"></span></span>
                ${s.letra}
            </td>
            <td class="px-6 py-4 text-gray-500 text-sm">${s.capacidad_maxima}</td>
            <td class="px-6 py-4 text-gray-700 text-sm">${docName}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="eliminarSeccion('${s.id}', '${s.nivel} - ${s.letra}')"
                    class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// =============================================================
// CRUD — CREAR SECCIÓN
// =============================================================

async function guardarSeccion() {
    const periodoId = document.getElementById('seccion-periodo').value;
    const nivel = document.getElementById('seccion-nivel').value;
    const letra = document.getElementById('seccion-letra').value;
    const capacidad = parseInt(document.getElementById('seccion-capacidad').value, 10);

    // Obtener todos los docentes seleccionados
    const selectsDocentes = document.querySelectorAll('.seccion-docente-select');
    const docentesIds = Array.from(selectsDocentes)
        .map(sel => sel.value)
        .filter(val => val !== '');

    if (!periodoId || !nivel || !letra || isNaN(capacidad)) {
        Swal.fire('Campos requeridos', 'Por favor llena todos los campos obligatorios.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-guardar-seccion');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const payload = {
        periodo_id: periodoId,
        nivel: nivel,
        letra: letra,
        capacidad_maxima: capacidad,
        docentes_ids: docentesIds
    };

    try {
        const res = await fetchWithAuth(`${API_BASE}/api/secciones`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.message || 'Error al guardar');

        cerrarModalCrearSeccion();
        await cargarSecciones();

        Swal.fire({
            icon: 'success',
            title: '¡Sección Registrada!',
            text: data.message,
            confirmButtonColor: '#2563eb',
            timer: 2500
        });

    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Sección';
    }
}

// =============================================================
// CRUD — ELIMINAR SECCIÓN
// =============================================================

async function eliminarSeccion(id, nombreDesc) {
    const confirm = await Swal.fire({
        title: `¿Eliminar ${nombreDesc}?`,
        text: 'Esta acción borrará la sección y desvinculará a los docentes. Los alumnos (si los hay) pueden quedar sin sección.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
        const res = await fetchWithAuth(`${API_BASE}/api/secciones/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Error al eliminar');

        cargarSecciones();
        Swal.fire('Eliminada', 'La sección ha sido eliminada', 'success');
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
}

// =============================================================
// INICIALIZACIÓN
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
    const btnGuardar = document.getElementById('btn-guardar-seccion');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarSeccion);
    }

    const linkSecciones = document.querySelector('[data-section="section-secciones"]');
    if (linkSecciones) {
        linkSecciones.addEventListener('click', () => {
            cargarSelectsSecciones();
            cargarSecciones();
        });
    }
});
