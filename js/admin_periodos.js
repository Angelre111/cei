// =============================================================
// MÓDULO: GESTIÓN DE PERÍODOS ACADÉMICOS
// Conecta la UI de admin.html con el API /api/periodos
// =============================================================

// auth.js carga antes y provee fetchWithAuth() + AUTH
// API_BASE ya está definido globalmente por admin_users.js
let periodosCache = [];

// ── BADGES de estado ──────────────────────────────────────────
const ESTADO_BADGE = {
    planificacion: 'bg-yellow-100 text-yellow-700',
    activo: 'bg-green-100  text-green-700',
    finalizado: 'bg-gray-100   text-gray-500'
};

const ESTADO_LABEL = {
    planificacion: 'Planificación',
    activo: 'Activo',
    finalizado: 'Finalizado'
};

// =============================================================
// MODAL
// =============================================================

function abrirModalPeriodo(periodoData = null) {
    const modal = document.getElementById('modal-periodo');
    const content = document.getElementById('modal-periodo-content');

    // Limpiar / pre-rellenar campos
    document.getElementById('periodo-edit-id').value = periodoData?.id ?? '';
    document.getElementById('periodo-nombre').value = periodoData?.nombre ?? '';
    document.getElementById('periodo-fecha-inicio').value = periodoData?.fecha_inicio ?? '';
    document.getElementById('periodo-fecha-fin').value = periodoData?.fecha_fin ?? '';
    document.getElementById('periodo-estado').value = periodoData?.estado ?? 'planificacion';

    // Actualizar título del modal de forma segura
    const spanTitulo = document.getElementById('modal-periodo-titulo-texto');
    if (spanTitulo) {
        spanTitulo.textContent = periodoData ? 'Editar Período Académico' : 'Nuevo Período Académico';
    }

    // Animar apertura — usar style.display para evitar conflicto hidden+flex en Tailwind CDN
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

function cerrarModalPeriodo() {
    const modal = document.getElementById('modal-periodo');
    const content = document.getElementById('modal-periodo-content');
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = '';
    }, 300);
}

// Cerrar al hacer clic fuera del modal
document.addEventListener('click', (e) => {
    const modal = document.getElementById('modal-periodo');
    if (modal && !modal.classList.contains('hidden') &&
        e.target === modal) {
        cerrarModalPeriodo();
    }
});

// Cerrar modal con tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('modal-periodo');
        if (modal && !modal.classList.contains('hidden')) {
            cerrarModalPeriodo();
        }
    }
});

// =============================================================
// CRUD — LEER
// =============================================================

async function cargarPeriodos() {
    const tbody = document.getElementById('tabla-periodos');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="px-6 py-10 text-center">
                <div class="flex items-center justify-center gap-2 text-gray-400">
                    <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                    </svg>
                    Cargando períodos...
                </div>
            </td>
        </tr>`;

    try {
        const res = await fetchWithAuth(`${API_BASE}/api/periodos`);
        const json = await res.json();

        if (!res.ok) throw new Error(json.message || 'Error al obtener períodos');

        periodosCache = json.periodos || [];
        renderTablaPeriodos(periodosCache);

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-400 text-sm">
            Error: ${err.message}
        </td></tr>`;
    }
}

function renderTablaPeriodos(periodos) {
    const tbody = document.getElementById('tabla-periodos');
    if (!tbody) return;

    if (!periodos.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-10 text-center text-gray-400 text-sm">
                    <svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
                    </svg>
                    No hay períodos registrados todavía.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = periodos.map(p => {
        const badge = ESTADO_BADGE[p.estado] || 'bg-gray-100 text-gray-500';
        const label = ESTADO_LABEL[p.estado] || p.estado;
        const fi = p.fecha_inicio ? new Date(p.fecha_inicio + 'T00:00:00').toLocaleDateString('es-VE') : '—';
        const ff = p.fecha_fin ? new Date(p.fecha_fin + 'T00:00:00').toLocaleDateString('es-VE') : '—';

        return `
        <tr class="hover:bg-gray-50 transition-colors group">
            <td class="px-6 py-4 font-semibold text-gray-800">${p.nombre}</td>
            <td class="px-6 py-4 text-gray-500 text-sm">${fi}</td>
            <td class="px-6 py-4 text-gray-500 text-sm">${ff}</td>
            <td class="px-6 py-4">
                <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${badge}">${label}</span>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-2 transition">
                    <button onclick="editarPeriodo('${p.id}')"
                        class="p-2 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition shadow-sm" title="Editar">
                        <i class="ph-bold ph-pencil-simple text-lg"></i>
                    </button>
                    <button onclick="eliminarPeriodo('${p.id}', '${p.nombre}')"
                        class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition shadow-sm" title="Eliminar">
                        <i class="ph-bold ph-trash text-lg"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// =============================================================
// HEADER GLOBAL — PERÍODO ACTIVO
// =============================================================

async function cargarPeriodoActivoHeader() {
    const spanPeriodo = document.getElementById('header-ano-activo');
    const container = document.getElementById('header-ano-container');
    if (!spanPeriodo) return;

    try {
        const res = await fetchWithAuth(`${API_BASE}/api/periodos`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.periodos && data.periodos.length > 0) {
            // Otorga prioridad a 'activo', luego 'planificacion', finalmente cualquiera
            const pActivo = data.periodos.find(p => p.estado === 'activo');
            const pPlanif = data.periodos.find(p => p.estado === 'planificacion');
            const p = pActivo || pPlanif || data.periodos[0];

            const estadoLabel = p.estado.charAt(0).toUpperCase() + p.estado.slice(1);
            spanPeriodo.textContent = `${p.nombre} (${estadoLabel})`;

            // Aplicar el estilo del contenedor
            if (container) {
                container.className = 'text-xs font-semibold px-3 py-1 rounded-full border transition-colors';
                if (p.estado === 'activo') {
                    container.classList.add('bg-green-100', 'text-green-800', 'border-green-200');
                } else if (p.estado === 'planificacion') {
                    container.classList.add('bg-yellow-100', 'text-yellow-800', 'border-yellow-200');
                } else {
                    container.classList.add('bg-gray-100', 'text-gray-800', 'border-gray-200');
                }
            }
        } else {
            spanPeriodo.textContent = 'Sin Asignar';
            if (container) container.className = 'text-xs font-semibold px-3 py-1 rounded-full border transition-colors bg-gray-100 text-gray-500 border-gray-200';
        }
    } catch (e) {
        console.warn('No se pudo cargar el período activo:', e);
    }
}

// =============================================================
// CRUD — CREAR / EDITAR
// =============================================================

async function guardarPeriodo() {
    const editId = document.getElementById('periodo-edit-id').value.trim();
    const nombre = document.getElementById('periodo-nombre').value.trim();
    const fechaInicio = document.getElementById('periodo-fecha-inicio').value;
    const fechaFin = document.getElementById('periodo-fecha-fin').value;
    const estado = document.getElementById('periodo-estado').value;

    if (!nombre || !fechaInicio || !fechaFin) {
        Swal.fire({
            title: 'Campos incompletos',
            text: 'El nombre y las fechas son obligatorios.',
            icon: 'warning',
            confirmButtonColor: '#4f46e5'
        });
        return;
    }

    const btn = document.getElementById('btn-guardar-periodo');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const esEdicion = !!editId;
    const url = esEdicion ? `${API_BASE}/api/periodos/${editId}` : `${API_BASE}/api/periodos`;
    const method = esEdicion ? 'PUT' : 'POST';

    try {
        const res = await fetchWithAuth(url, {
            method,
            body: JSON.stringify({ nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin, estado })
        });
        const json = await res.json();

        if (!res.ok) throw new Error(json.message || 'Error al guardar');

        cerrarModalPeriodo();
        await cargarPeriodos();
        cargarPeriodoActivoHeader();

        Swal.fire({
            icon: 'success',
            title: esEdicion ? '¡Período actualizado!' : '¡Período creado!',
            text: json.message,
            confirmButtonColor: '#4f46e5',
            timer: 2500,
            timerProgressBar: true
        });

    } catch (err) {
        Swal.fire({
            title: 'Error',
            text: err.message,
            icon: 'error',
            confirmButtonColor: '#4f46e5'
        });
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Período';
    }
}

function editarPeriodo(id) {
    const p = periodosCache.find(x => x.id === id);
    if (p) abrirModalPeriodo(p);
}

// =============================================================
// CRUD — ELIMINAR
// =============================================================

async function eliminarPeriodo(id, nombre) {
    const confirm = await Swal.fire({
        title: `¿Eliminar "${nombre}"?`,
        text: 'Esta acción no se puede deshacer. El período será eliminado permanentemente.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    try {
        const res = await fetchWithAuth(`${API_BASE}/api/periodos/${id}`, {
            method: 'DELETE'
        });
        const json = await res.json();

        if (!res.ok) throw new Error(json.message || 'Error al eliminar');

        await cargarPeriodos();
        cargarPeriodoActivoHeader();
        Swal.fire({
            icon: 'success',
            title: 'Eliminado',
            text: json.message,
            confirmButtonColor: '#4f46e5',
            timer: 2000,
            timerProgressBar: true
        });

    } catch (err) {
        Swal.fire({
            title: 'No se pudo eliminar',
            text: err.message,
            icon: 'error',
            confirmButtonColor: '#4f46e5'
        });
    }
}

// =============================================================
// INIT — Se ejecuta al cargar el DOM
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Listener botón guardar del modal
    const btnGuardar = document.getElementById('btn-guardar-periodo');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarPeriodo);
    }

    // Cargar el nombre del período activo globalmente al iniciar
    cargarPeriodoActivoHeader();

    // Auto-completar Nombre del Período a partir de las fechas
    const inputInicio = document.getElementById('periodo-fecha-inicio');
    const inputFin = document.getElementById('periodo-fecha-fin');
    const inputNombre = document.getElementById('periodo-nombre');

    function actualizarNombrePeriodo() {
        if (!inputInicio || !inputFin || !inputNombre) return;

        const fechaInicioStr = inputInicio.value;
        const fechaFinStr = inputFin.value;

        if (fechaInicioStr && fechaFinStr) {
            const anioInicio = fechaInicioStr.split('-')[0];
            const anioFin = fechaFinStr.split('-')[0];
            inputNombre.value = `${anioInicio}-${anioFin}`;
        } else {
            inputNombre.value = '';
        }
    }

    if (inputInicio && inputFin) {
        inputInicio.addEventListener('change', actualizarNombrePeriodo);
        inputFin.addEventListener('change', actualizarNombrePeriodo);
    }

    // Cargar automáticamente cuando se navega a la sección de períodos
    const linkPeriodos = document.querySelector('[data-section="section-periodos"]');
    if (linkPeriodos) {
        linkPeriodos.addEventListener('click', () => {
            cargarPeriodos();
        });
    }
});
