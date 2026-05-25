// ============================================================
// admin_users.js — Gestión de Usuarios del Panel Administrativo
// ============================================================

const API_BASE = window.API_BASE_URL || '';
let cachedUsuarios = []; // Cache para búsqueda local
let tabActualUsuarios = 'personal'; // 'personal' (admin+docente) | 'representantes'

// auth.js provee fetchWithAuth() y AUTH globalmente


// ─────────────────────────────────────────────────────────────
// CARGAR Y RENDERIZAR TABLA DE USUARIOS DESDE LA API
// ─────────────────────────────────────────────────────────────
async function cargarYRenderizarUsuarios() {
    const tbody = document.getElementById('user-table-body');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="px-6 py-10 text-center text-gray-400">
                <div class="flex flex-col items-center gap-2">
                    <svg class="w-6 h-6 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                    </svg>
                    <span class="text-sm">Cargando usuarios...</span>
                </div>
            </td>
        </tr>`;

    try {
        const response = await fetchWithAuth(`${API_BASE}/api/usuarios?tipo=${tabActualUsuarios}`);

        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message);

        cachedUsuarios = data.usuarios || []; // Guardar en caché

        // Actualizar estadísticas en el Dashboard principal
        const totalAdmins = cachedUsuarios.filter(u => u.rol === 'administrador').length;
        const totalDocentes = cachedUsuarios.filter(u => u.rol === 'docente').length;

        const cardAdmins = document.getElementById('dash-total-admins');
        const cardDocentes = document.getElementById('dash-total-teachers');
        if (cardAdmins) cardAdmins.innerText = totalAdmins;
        if (cardDocentes) cardDocentes.innerText = totalDocentes;

        // Temporal: mostrar solo usuarios activos e invitados
        const usuariosFiltrados = cachedUsuarios.filter(u => u.estado === 'activo' || u.estado === 'invitado');
        renderizarTablaUsuarios(usuariosFiltrados);

    } catch (error) {
        console.error('Error cargando usuarios:', error);
        const tbody = document.getElementById('user-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-10 text-center text-red-400 text-sm">
                    No se pudo cargar la lista de usuarios. Intenta recargar la página.
                </td>
            </tr>`;
    }
}

// ─────────────────────────────────────────────────────────────
// CAMBIAR TAB: Personal ↔ Representantes
// ─────────────────────────────────────────────────────────────
function cambiarTabUsuarios(tipo) {
    tabActualUsuarios = tipo;

    const btnPersonal = document.getElementById('btn-tab-personal');
    const btnReps = document.getElementById('btn-tab-representantes');
    const btnNuevo = document.getElementById('btn-nuevo-usuario');
    const subtitulo = document.getElementById('user-section-subtitle');

    const activa = 'flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold rounded-xl bg-white shadow-sm text-purple-700 transition-all flex items-center gap-2 justify-center';
    const inactiva = 'flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 transition-all flex items-center gap-2 justify-center';

    if (tipo === 'personal') {
        if (btnPersonal) btnPersonal.className = activa;
        if (btnReps) btnReps.className = inactiva;
        if (btnNuevo) btnNuevo.classList.remove('hidden');
        if (subtitulo) subtitulo.textContent = 'Gestiona los accesos de Administradores y Docentes.';
    } else {
        if (btnReps) btnReps.className = activa;
        if (btnPersonal) btnPersonal.className = inactiva;
        if (btnNuevo) btnNuevo.classList.add('hidden');
        if (subtitulo) subtitulo.textContent = 'Consulta los representantes registrados en el sistema.';
    }

    // Limpiar buscador y recargar con el nuevo filtro del backend
    const searchInput = document.getElementById('user-search-input');
    if (searchInput) searchInput.value = '';
    cargarYRenderizarUsuarios();
}

// ─────────────────────────────────────────────────────────────
function renderizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '';

    if (!usuarios || usuarios.length === 0) {
        const query = document.getElementById('user-search-input')?.value || '';
        if (query.trim() !== '' && typeof verificarEstadoVacio === 'function') {
            verificarEstadoVacio('user-table-body', query, 4);
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-16 text-center text-gray-400">
                        <div class="flex flex-col items-center gap-2 opacity-40">
                            <i class="ph-duotone ph-users-three text-6xl mb-2"></i>
                            <p class="text-sm font-semibold tracking-tight">No hay usuarios en esta categoría.</p>
                        </div>
                    </td>
                </tr>`;
        }
        return;
    }

    // ID del usuario actual (no puede eliminarse a sí mismo)
    const currentUserId = localStorage.getItem('user_id') || '';

    let html = '';

    usuarios.forEach(u => {
        const nombreCompleto = `${u.nombres || ''} ${u.apellidos || ''}`.trim();
        const inicial = nombreCompleto.charAt(0).toUpperCase() || '?';

        const rolDisplayMap = { administrador: 'Administrador', docente: 'Docente', representante: 'Representante' };
        const rolDisplay = rolDisplayMap[u.rol] || u.rol;
        const rolBadge = u.rol === 'administrador'
            ? 'bg-purple-50 text-purple-700 border-purple-100'
            : u.rol === 'representante'
                ? 'bg-rose-50 text-rose-700 border-rose-100'
                : 'bg-pink-50 text-pink-700 border-pink-100';
        const avatarGradient = u.rol === 'representante' ? 'from-rose-400 to-rose-600' : 'from-purple-500 to-purple-700';

        const estadoDisplay = u.estado
            ? u.estado.charAt(0).toUpperCase() + u.estado.slice(1)
            : 'Desconocido';

        const estadoConfig = {
            activo: { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50/50' },
            pendiente: { dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50/50' },
            inactivo: { dot: 'bg-red-400', text: 'text-red-700', bg: 'bg-red-50/50' },
        };
        const estilo = estadoConfig[u.estado] || { dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-50' };

        // El admin no puede eliminarse a sí mismo
        const esMismoUsuario = u.id === currentUserId;
        const esRepresentante = u.rol === 'representante';

        html += `
            <tr class="hover:bg-gray-50/80 border-b border-gray-100 transition-colors group">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-4">
                        <div class="w-11 h-11 rounded-2xl bg-gradient-to-br ${avatarGradient} text-white flex items-center justify-center font-bold text-lg shadow-sm transform group-hover:scale-110 transition-transform duration-300">
                            ${inicial}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800 leading-none mb-1">${nombreCompleto}</p>
                            <p class="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                                <i class="ph-bold ph-envelope-simple"></i>
                                ${u.email}
                            </p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-3 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider border ${rolBadge}">
                        ${rolDisplay}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-transparent ${estilo.bg} ${estilo.text} transition-all duration-300 group-hover:border-current/10">
                        <span class="relative flex h-2 w-2">
                            ${u.estado === 'activo' ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>` : ''}
                            <span class="relative inline-flex rounded-full h-2 w-2 ${estilo.dot}"></span>
                        </span>
                        <span class="text-xs font-bold uppercase tracking-tight">${estadoDisplay}</span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center justify-end gap-2.5">
                        ${(u.estado === 'invitado' || u.estado === 'pendiente') ? `
                        <button
                            data-email="${u.email}"
                            onclick="reenviarInvitacionBtn(this)"
                            title="Reenviar enlace de invitación/clave"
                            class="p-2 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all shadow-sm">
                            <i class="ph-bold ph-paper-plane-tilt text-lg"></i>
                        </button>` : ''}
                        
                        ${esRepresentante ? `
                        <button
                            onclick="abrirModalRepresentanteVincular('${u.id}', '${nombreCompleto.replace(/'/g, "\\'")}')"
                            title="Ver datos de representante"
                            class="p-2 text-pink-500 hover:text-pink-700 bg-pink-50 hover:bg-pink-100 rounded-xl transition-all shadow-sm">
                            <i class="ph-bold ph-eye text-lg"></i>
                        </button>` : ''}
                        
                        <button
                            data-user-id="${u.id}"
                            data-nombres="${u.nombres}"
                            data-apellidos="${u.apellidos}"
                            data-email="${u.email}"
                            data-estado="${u.estado}"
                            data-rol="${u.rol}"
                            data-es-mismo-usuario="${esMismoUsuario}"
                            data-es-representante="${esRepresentante}"
                            onclick="abrirModalEditarDesdeBtn(this)"
                            title="Editar usuario"
                            class="p-2 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all shadow-sm">
                            <i class="ph-bold ph-pencil-simple text-lg"></i>
                        </button>
                        
                        <button
                            data-user-id="${u.id}"
                            data-nombre-completo="${nombreCompleto}"
                            onclick="${esMismoUsuario ? '' : 'confirmarEliminarDesdeBtn(this)'}"
                            title="${esMismoUsuario ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}"
                            ${esMismoUsuario ? 'disabled' : ''}
                            class="p-2 rounded-xl transition-all shadow-sm ${esMismoUsuario
                ? 'text-gray-200 bg-gray-50 cursor-not-allowed shadow-none'
                : 'text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100'}">
                            <i class="ph-bold ph-trash text-lg"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    });

    tbody.innerHTML = html;
}


// ─────────────────────────────────────────────────────────────
// FILTRAR USUARIOS (BÚSQUEDA LOCAL)
// ─────────────────────────────────────────────────────────────
function filtrarUsuarios() {
    const query = document.getElementById('user-search-input').value.toLowerCase().trim();
    const countEl = document.getElementById('user-search-count');

    if (!query) {
        // Temporal: mostrar solo usuarios activos e invitados
        const usuariosFiltrados = cachedUsuarios.filter(u => u.estado === 'activo' || u.estado === 'invitado');
        renderizarTablaUsuarios(usuariosFiltrados);
        if (countEl) countEl.innerText = 'Mostrando todos los usuarios';
        return;
    }

    const filtrados = cachedUsuarios.filter(u => {
        const nombreCompleto = `${u.nombres} ${u.apellidos}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        const estado = (u.estado || '').toLowerCase();
        const rol = (u.rol || '').toLowerCase();

        return nombreCompleto.includes(query) ||
            email.includes(query) ||
            estado.includes(query) ||
            rol.includes(query);
    });

    renderizarTablaUsuarios(filtrados);

    if (countEl) {
        countEl.innerText = filtrados.length === 1
            ? '1 usuario encontrado'
            : `${filtrados.length} usuarios encontrados`;
    }
}

// ─────────────────────────────────────────────────────────────
// WRAPPERS: leen data-* del botón y llaman las funciones reales
// ─────────────────────────────────────────────────────────────
window.abrirModalEditarDesdeBtn = function(btn) {
    abrirModalEditar(
        btn.dataset.userId,
        btn.dataset.nombres || '',
        btn.dataset.apellidos || '',
        btn.dataset.email || '',
        btn.dataset.estado || '',
        btn.dataset.rol || '',
        btn.dataset.esMismoUsuario === 'true',
        btn.dataset.esRepresentante === 'true'
    );
};

window.confirmarEliminarDesdeBtn = function(btn) {
    confirmarEliminar(btn.dataset.userId, btn.dataset.nombreCompleto);
};

window.reenviarInvitacionBtn = async function(btn) {
    const email = btn.dataset.email;
    const { isConfirmed } = await Swal.fire({
        title: '¿Reenviar invitación?',
        text: `Se enviará un nuevo enlace de configuración de clave a ${email}.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, reenviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#9ca3af',
        customClass: { popup: 'rounded-2xl' }
    });

    if(!isConfirmed) return;

    Swal.fire({
        title: 'Reenviando...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetchWithAuth(`${API_BASE}/api/reenviar_invitacion`, {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            Swal.fire('¡Enviado!', data.message, 'success');
        } else {
            Swal.fire('Error', data.message || 'Error al reenviar', 'error');
        }
    } catch(err) {
        console.error(err);
        Swal.fire('Error de red', 'No se pudo contactar al servidor.', 'error');
    }
};

window.abrirModalRepresentanteVincular = async function(userId, nombre) {
    // ── 1. Mostrar modal de carga inmediatamente ──────────────────────────────
    Swal.fire({
        title: `<span style="font-size:1.1rem">👨‍👩‍👧‍👦 ${nombre}</span>`,
        html: `<div style="text-align:center;padding:20px 0">
                 <svg style="width:32px;height:32px;animation:spin 0.8s linear infinite;color:#8b5cf6" fill="none" viewBox="0 0 24 24">
                   <circle style="opacity:0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                   <path style="opacity:0.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                 </svg>
                 <p style="color:#6b7280;font-size:0.85rem;margin-top:8px">Cargando hijos...</p>
               </div>`,
        showConfirmButton: false,
        allowOutsideClick: false,
        customClass: { popup: 'rounded-[2rem]' }
    });

    // ── 2. Obtener hijos del representante ───────────────────────────────────
    let hijos = [];
    try {
        const res = await fetchWithAuth(`${API_BASE}/api/admin/representante/${userId}/hijos`);
        const data = await res.json();
        if (res.ok && data.success) hijos = data.hijos || [];
    } catch (err) {
        console.error('Error al obtener hijos del representante:', err);
    }

    const MAX_HIJOS = 8;
    const puedeAgregarMas = hijos.length < MAX_HIJOS;
    const emailRep = cachedUsuarios.find(u => u.id === userId)?.email || '';

    // ── 3. Construir HTML de la lista de hijos ───────────────────────────────
    const hijosHtml = hijos.length > 0
        ? hijos.map(h => `
            <div id="hijo-row-${h.id}"
                 style="display:flex;align-items:center;gap:10px;padding:10px 12px;
                        background:#f9fafb;border-radius:14px;border:1px solid #e5e7eb;margin-bottom:8px">
                <!-- Avatar inicial -->
                <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#6d28d9);
                            color:#fff;font-weight:800;font-size:1rem;display:flex;align-items:center;
                            justify-content:center;flex-shrink:0">
                    ${(h.nombres[0] || '?').toUpperCase()}
                </div>
                <!-- Info -->
                <div style="flex:1;min-width:0;text-align:left">
                    <p style="font-weight:700;color:#1f2937;font-size:0.85rem;
                               white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${h.nombres} ${h.apellidos}
                    </p>
                    <p style="font-size:0.72rem;color:#6b7280;margin-top:1px">
                        <span style="font-family:monospace;background:#ede9fe;color:#5b21b6;
                                     padding:1px 6px;border-radius:6px;font-weight:700">
                            ${h.cedula_escolar || 'S/N'}
                        </span>
                        &nbsp;·&nbsp;${h.seccion || 'Sin sección'}
                    </p>
                </div>
                <!-- Botón eliminar -->
                <button onclick="adminEliminarHijo(${h.id}, '${h.nombres} ${h.apellidos}', '${userId}', '${nombre.replace(/'/g, "\\'")}')"
                        title="Eliminar registro de este estudiante"
                        style="width:32px;height:32px;border-radius:10px;border:1px solid #fca5a5;
                               background:#fff1f2;color:#ef4444;cursor:pointer;
                               display:flex;align-items:center;justify-content:center;
                               flex-shrink:0;transition:all 0.15s">
                    <i class="ph-bold ph-trash" style="font-size:0.9rem"></i>
                </button>
            </div>`)
        .join('')
        : `<div style="text-align:center;padding:20px 0;color:#9ca3af">
               <i class="ph-duotone ph-baby" style="font-size:2.5rem;display:block;margin-bottom:8px"></i>
               <p style="font-size:0.85rem">No hay hijos registrados aún.</p>
           </div>`;

    // ── 4. Renderizar modal completo ─────────────────────────────────────────
    Swal.fire({
        title: `<span style="font-size:1rem;font-weight:800">👨‍👩‍👧‍👦 ${nombre}</span>`,
        html: `
            <div style="text-align:left">
                <!-- Contador -->
                <div style="display:flex;align-items:center;justify-content:space-between;
                            margin-bottom:12px;padding:8px 12px;background:#f5f3ff;
                            border-radius:12px;border:1px solid #ede9fe">
                    <p style="font-size:0.78rem;font-weight:700;color:#5b21b6">
                        <i class="ph-bold ph-users-three" style="margin-right:4px"></i>
                        Hijos vinculados: <strong>${hijos.length} / ${MAX_HIJOS}</strong>
                    </p>
                    ${puedeAgregarMas
                        ? `<button onclick="adminAbrirRegistroParaRep('${emailRep}')"
                                   style="padding:5px 12px;background:#7c3aed;color:#fff;border-radius:10px;
                                          border:none;font-size:0.75rem;font-weight:700;cursor:pointer;
                                          display:flex;align-items:center;gap:5px;transition:all 0.15s">
                               <i class="ph-bold ph-plus-circle"></i> Agregar hijo
                           </button>`
                        : `<span style="font-size:0.72rem;color:#ef4444;font-weight:700">Límite alcanzado</span>`
                    }
                </div>
                <!-- Lista de hijos -->
                <div id="lista-hijos-modal">${hijosHtml}</div>
            </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#EC4899',
        width: '480px',
        customClass: {
            popup: 'rounded-[2rem]',
            confirmButton: 'rounded-xl px-8 py-3'
        }
    });
};


// ─────────────────────────────────────────────────────────────
// HELPER: Eliminar hijo desde el modal de representante
// ─────────────────────────────────────────────────────────────
window.adminEliminarHijo = async function(hijoId, nombreHijo, repUserId, repNombre) {
    const result = await Swal.fire({
        title: '¿Eliminar registro?',
        html: `<p style="color:#374151;margin-bottom:8px">Se eliminará permanentemente a:</p>
               <p style="font-weight:800;color:#7c3aed;font-size:1.05rem">${nombreHijo}</p>
               <p style="color:#ef4444;font-size:0.8rem;margin-top:10px">
                 ⚠️ Esta acción borrará la ficha, asistencias y evaluaciones.<br>Es irreversible.
               </p>
               <p style="color:#4b5563;font-size:0.85rem;margin-top:12px;font-weight:600;">
                 Se recomienda realizar un respaldo de la base de datos antes de proceder.
               </p>`,
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '📦 Respaldar y Eliminar',
        denyButtonText: '🗑️ Eliminar sin Respaldar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10b981', // Verde Esmeralda
        denyButtonColor: '#ef4444',    // Rojo
        cancelButtonColor: '#9ca3af',  // Gris
        reverseButtons: true,
        focusCancel: true,
        customClass: { popup: 'rounded-[2rem]' }
    });

    if (result.isDismissed) return; // Clic en Cancelar o fuera del diálogo

    const hacerBackup = result.isConfirmed; // Clic en "Respaldar y Eliminar"

    if (hacerBackup) {
        Swal.fire({
            title: 'Creando respaldo...',
            text: 'Por favor espera un momento.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const resBackup = await fetchWithAuth(`${API_BASE}/api/admin/backup-manual`, { method: 'POST' });
            const dataBackup = await resBackup.json();

            if (!resBackup.ok || !dataBackup.success) {
                // Si falla el respaldo, preguntar si desea abortar o proceder de todos modos
                const proceedAnyway = await Swal.fire({
                    title: 'Error al crear respaldo',
                    text: dataBackup.message || 'No se pudo generar el archivo de respaldo. ¿Deseas continuar con la eliminación de todos modos?',
                    icon: 'error',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, eliminar sin respaldo',
                    cancelButtonText: 'Abortar eliminación',
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#9ca3af',
                    reverseButtons: true,
                    customClass: { popup: 'rounded-[2rem]' }
                });
                if (!proceedAnyway.isConfirmed) return;
            }
        } catch (err) {
            console.error('Error al generar respaldo:', err);
            const proceedAnyway = await Swal.fire({
                title: 'Error de red al respaldar',
                text: 'No se pudo contactar al servidor para realizar el respaldo. ¿Deseas continuar con la eliminación de todos modos?',
                icon: 'error',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar sin respaldo',
                cancelButtonText: 'Abortar eliminación',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#9ca3af',
                reverseButtons: true,
                customClass: { popup: 'rounded-[2rem]' }
            });
            if (!proceedAnyway.isConfirmed) return;
        }
    }

    // Procede a eliminar
    Swal.fire({ title: 'Eliminando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const res = await fetchWithAuth(`${API_BASE}/api/admin/hijos/${hijoId}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok && data.success) {
            // Eliminar la fila del modal sin cerrarlo (solo aplica si viene del modal representante)
            const row = document.getElementById(`hijo-row-${hijoId}`);
            if (row) row.remove();

            await Swal.fire({
                icon: 'success',
                title: '¡Eliminado!',
                text: data.message + (hacerBackup ? ' (Respaldo creado con éxito)' : ''),
                timer: 2000,
                showConfirmButton: false,
                customClass: { popup: 'rounded-[2rem]' }
            });

            if (repUserId) {
                // Venía del modal de representante → reabrirlo con datos frescos
                window.abrirModalRepresentanteVincular(repUserId, repNombre);
            } else {
                // Venía del modal "Inscribir Alumno" → cerrarlo y recargar matrícula
                if (typeof cerrarModalRegistrarAlumno === 'function') cerrarModalRegistrarAlumno();
                if (typeof cargarMatriculaGeneral === 'function') cargarMatriculaGeneral();
            }
        } else {
            Swal.fire({ icon: 'error', title: 'Error', text: data.message || 'No se pudo eliminar.', confirmButtonColor: '#EF4444', customClass: { popup: 'rounded-[2rem]' } });
        }
    } catch (err) {
        console.error('Error al eliminar hijo:', err);
        Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo contactar al servidor.', confirmButtonColor: '#EF4444', customClass: { popup: 'rounded-[2rem]' } });
    }
};

// ─────────────────────────────────────────────────────────────
// HELPER: Abrir modal de registro con email del representante pre-llenado
// ─────────────────────────────────────────────────────────────
window.adminAbrirRegistroParaRep = function(emailRep) {
    Swal.close(); // Cerrar el modal de representante
    // Pequeño delay para que el cierre sea suave
    setTimeout(() => {
        abrirModalRegistrarNuevoEstudiante(emailRep);
    }, 200);
};

// ─────────────────────────────────────────────────────────────
// ACCIÓN: EDITAR USUARIO — Modal SweetAlert2
// ─────────────────────────────────────────────────────────────
async function abrirModalEditar(userId, nombres, apellidos, email, estadoActual, rolActual, esMismoUsuario = false, esRepresentante = false) {
    // Rellenamos el formulario del modal
    document.getElementById('edit-user-id').value = userId;
    document.getElementById('edit-user-first-name').value = nombres;
    document.getElementById('edit-user-last-name').value = apellidos;
    document.getElementById('edit-user-email').value = email;
    document.getElementById('edit-user-role').value = rolActual;
    document.getElementById('edit-user-status').value = estadoActual;

    // Bloquear campos de rol y estado si es el mismo usuario y mostrar warning
    const rolSelect = document.getElementById('edit-user-role');
    const statusSelect = document.getElementById('edit-user-status');
    const rolWarn = document.getElementById('edit-user-role-warn');
    const statusWarn = document.getElementById('edit-user-status-warn');

    if (esMismoUsuario) {
        rolSelect.disabled = true;
        statusSelect.disabled = true;
        rolSelect.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
        statusSelect.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
        rolWarn.classList.remove('hidden');
        statusWarn.classList.remove('hidden');
    } else if (esRepresentante) {
        // Representantes: solo se puede cambiar su estado, no su rol
        rolSelect.disabled = true;
        statusSelect.disabled = false;
        rolSelect.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
        statusSelect.classList.remove('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
        rolWarn.classList.remove('hidden');
        statusWarn.classList.add('hidden');
    } else {
        rolSelect.disabled = false;
        statusSelect.disabled = false;
        rolSelect.classList.remove('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
        statusSelect.classList.remove('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
        rolWarn.classList.add('hidden');
        statusWarn.classList.add('hidden');
    }

    // Mostrar modal con animaciones
    const modal = document.getElementById('modal-editar-usuario');
    const content = document.getElementById('modal-editar-usuario-content');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

window.cerrarModalEditarUsuario = function () {
    const modal = document.getElementById('modal-editar-usuario');
    const content = document.getElementById('modal-editar-usuario-content');

    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// Cerrar modal con tecla ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modalEdit = document.getElementById('modal-editar-usuario');
        if (modalEdit && !modalEdit.classList.contains('hidden')) {
            cerrarModalEditarUsuario();
        }
        
        // Opcional: Cerrar cualquier otro modal que exista
        const modalCreate = document.getElementById('modal-crear-usuario');
        if (modalCreate && !modalCreate.classList.contains('hidden') && typeof cerrarModalCrearUsuario === 'function') {
            cerrarModalCrearUsuario();
        }
    }
});

// Botón "Guardar Cambios" del Modal de Edición
document.addEventListener('DOMContentLoaded', () => {
    const btnUpdateUser = document.getElementById('btn-update-user');
    if (btnUpdateUser) {
        btnUpdateUser.addEventListener('click', async () => {
            const userId = document.getElementById('edit-user-id').value;
            const formValues = {
                nombres: document.getElementById('edit-user-first-name').value.trim(),
                apellidos: document.getElementById('edit-user-last-name').value.trim(),
                email: document.getElementById('edit-user-email').value.trim(),
                rol: document.getElementById('edit-user-role').value,
                estado: document.getElementById('edit-user-status').value
            };

            if (!formValues.nombres || !formValues.apellidos) {
                Swal.fire({ title: 'Campos Requeridos', text: 'El nombre y apellido son obligatorios', icon: 'warning', confirmButtonColor: '#9333ea' });
                return;
            }

            const textoOriginal = btnUpdateUser.innerHTML;
            btnUpdateUser.innerHTML = `<svg class="w-4 h-4 animate-spin inline mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Guardando...`;
            btnUpdateUser.disabled = true;

            try {
                const response = await fetchWithAuth(`${API_BASE}/api/usuarios/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify(formValues)
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    cerrarModalEditarUsuario();
                    await Swal.fire({
                        icon: 'success',
                        title: '¡Actualizado!',
                        text: data.message,
                        confirmButtonColor: '#7c3aed',
                        timer: 2500,
                        timerProgressBar: true
                    });
                    await cargarYRenderizarUsuarios(); // Recargar tabla
                } else {
                    Swal.fire({ icon: 'error', title: 'Error', text: data.message, confirmButtonColor: '#EF4444' });
                }
            } catch (error) {
                console.error('Error al editar:', error);
                Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'No se pudo conectar con el servidor.', confirmButtonColor: '#EF4444' });
            } finally {
                btnUpdateUser.innerHTML = textoOriginal;
                btnUpdateUser.disabled = false;
            }
        });
    }
});

// ─────────────────────────────────────────────────────────────
// ACCIÓN: ELIMINAR USUARIO — Confirmación SweetAlert2
// ─────────────────────────────────────────────────────────────
async function confirmarEliminar(userId, nombreCompleto) {

    const { isConfirmed } = await Swal.fire({
        title: '¿Eliminar usuario?',
        html: `
            <p style="color:#374151;margin-bottom:8px">Estás a punto de eliminar a:</p>
            <p style="font-weight:700;color:#7c3aed;font-size:1.1rem">${nombreCompleto}</p>
            <p style="color:#ef4444;font-size:13px;margin-top:12px">⚠️ Esta acción es permanente e irreversible.<br>
            El usuario perderá acceso al sistema inmediatamente.</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        reverseButtons: true,      // "Cancelar" a la izquierda, "Eliminar" a la derecha
        focusCancel: true          // Foco por defecto en Cancelar (más seguro)
    });

    if (!isConfirmed) return;

    // Loading mientras se elimina
    Swal.fire({
        title: 'Eliminando...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const response = await fetchWithAuth(`${API_BASE}/api/usuarios/${userId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            await Swal.fire({
                icon: 'success',
                title: data.soft_deleted ? 'Usuario desactivado' : 'Usuario eliminado',
                text: data.message,
                confirmButtonColor: '#7c3aed',
                timer: data.soft_deleted ? 4000 : 2500,
                timerProgressBar: true
            });
            await cargarYRenderizarUsuarios(); // Recargar tabla
        } else {
            Swal.fire({ icon: 'error', title: 'Error', text: data.message, confirmButtonColor: '#EF4444' });
        }

    } catch (error) {
        console.error('Error al eliminar:', error);
        Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'No se pudo conectar con el servidor.', confirmButtonColor: '#EF4444' });
    }
}

// ─────────────────────────────────────────────────────────────
// MODAL: CREAR USUARIO (UI)
// ─────────────────────────────────────────────────────────────
window.abrirModalCrearUsuario = function () {
    const modal = document.getElementById('modal-crear-usuario');
    const content = document.getElementById('modal-crear-usuario-content');

    // Resetear formulario simplificado
    document.getElementById('user-email').value = '';
    document.getElementById('user-role').value = '';

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
};

window.cerrarModalCrearUsuario = function () {
    const modal = document.getElementById('modal-crear-usuario');
    const content = document.getElementById('modal-crear-usuario-content');

    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');

    // Esperar a que termine la animación para ocultarlo
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
};


// ─────────────────────────────────────────────────────────────
// FORMULARIO: CREAR NUEVO USUARIO
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Cargar tabla cuando la sección de usuarios se hace visible
    const seccionUsuarios = document.getElementById('section-usuarios');
    if (seccionUsuarios) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'class') {
                    const isVisible = !seccionUsuarios.classList.contains('hidden');
                    if (isVisible) cargarYRenderizarUsuarios();
                }
            });
        });
        observer.observe(seccionUsuarios, { attributes: true });

        if (!seccionUsuarios.classList.contains('hidden')) {
            cargarYRenderizarUsuarios();
        }
    }


    // ── Buscador de Usuarios ────────────────────────────────
    const searchInput = document.getElementById('user-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', filtrarUsuarios);
    }

    // ── Botón "Crear Usuario" ───────────────────────────────
    const btnAddUser = document.getElementById('btn-add-user');
    if (!btnAddUser) return;

    btnAddUser.addEventListener('click', async () => {
        const email = document.getElementById('user-email').value.trim();
        const rol = document.getElementById('user-role').value;

        if (!email || !rol) {
            Swal.fire({ title: 'Campos Incompletos', text: 'Por favor, ingresa el correo y selecciona un rol.', icon: 'warning', confirmButtonColor: '#9333ea' });
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            Swal.fire({ title: 'Email Inválido', text: 'Ingresa un correo electrónico válido.', icon: 'error', confirmButtonColor: '#EF4444' });
            return;
        }

        const textoOriginal = btnAddUser.innerHTML;
        btnAddUser.innerHTML = `<svg class="w-4 h-4 animate-spin inline mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Enviando invitación...`;
        btnAddUser.disabled = true;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetchWithAuth(`${API_BASE}/api/crear_personal`, {
                method: 'POST',
                body: JSON.stringify({ email, rol })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                Swal.fire({ title: '¡Invitación Enviada!', text: data.message, icon: 'success', confirmButtonColor: '#9333ea' });

                document.getElementById('user-email').value = '';
                document.getElementById('user-role').value = '';

                cerrarModalCrearUsuario();
                await cargarYRenderizarUsuarios();
            } else {
                Swal.fire({ title: 'Error', text: data.message || 'No se pudo enviar la invitación.', icon: 'error', confirmButtonColor: '#EF4444' });
            }

        } catch (error) {
            console.error('Error:', error);
            Swal.fire({ title: 'Error de Conexión', text: 'Ocurrió un error al contactar con el servidor.', icon: 'error', confirmButtonColor: '#EF4444' });
        } finally {
            btnAddUser.innerHTML = textoOriginal;
            btnAddUser.disabled = false;
        }
    });
});
