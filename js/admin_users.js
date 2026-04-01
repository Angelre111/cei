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

        renderizarTablaUsuarios(cachedUsuarios);

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
            verificarEstadoVacio('user-table-body', query, 0);
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-12 text-center text-gray-400">
                        <div class="flex flex-col items-center gap-2 opacity-60">
                            <i class="ph-duotone ph-users-three text-5xl mb-2"></i>
                            <p class="text-sm font-medium">No hay usuarios registrados todavía.</p>
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
        const inicial = nombreCompleto.charAt(0).toUpperCase();

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
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button
                            data-user-id="${u.id}"
                            data-nombres="${u.nombres}"
                            data-apellidos="${u.apellidos}"
                            data-email="${u.email}"
                            data-estado="${u.estado}"
                            data-rol="${u.rol}"
                            data-es-mismo-usuario="${esMismoUsuario}"
                            data-es-representante="${u.rol === 'representante'}"
                            onclick="abrirModalEditarDesdeBtn(this)"
                            title="Editar usuario"
                            class="p-2.5 text-blue-500 hover:text-white hover:bg-blue-500 rounded-xl transition-all duration-300 shadow-sm hover:shadow-blue-200">
                            <i class="ph-bold ph-pencil-simple text-xl"></i>
                        </button>
                        <button
                            data-user-id="${u.id}"
                            data-nombre-completo="${nombreCompleto}"
                            onclick="${esMismoUsuario ? '' : 'confirmarEliminarDesdeBtn(this)'}"
                            title="${esMismoUsuario ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}"
                            ${esMismoUsuario ? 'disabled' : ''}
                            class="p-2.5 rounded-xl transition-all duration-300 shadow-sm ${esMismoUsuario
                                ? 'text-gray-200 bg-gray-50 cursor-not-allowed shadow-none'
                                : 'text-red-500 hover:text-white hover:bg-red-500 hover:shadow-red-200'}">
                            <i class="ph-bold ph-trash text-xl"></i>
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
        renderizarTablaUsuarios(cachedUsuarios);
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
function abrirModalEditarDesdeBtn(btn) {
    abrirModalEditar(
        btn.dataset.userId,
        btn.dataset.nombres,
        btn.dataset.apellidos,
        btn.dataset.email,
        btn.dataset.estado,
        btn.dataset.rol,
        btn.dataset.esMismoUsuario === 'true',
        btn.dataset.esRepresentante === 'true'
    );
}
function confirmarEliminarDesdeBtn(btn) {
    confirmarEliminar(btn.dataset.userId, btn.dataset.nombreCompleto);
}

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
                title: 'Usuario eliminado',
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

    // Resetear formulario por si acaso
    document.getElementById('user-first-name').value = '';
    document.getElementById('user-last-name').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-role').value = '';
    document.getElementById('user-status').value = 'activo';
    document.getElementById('user-password').value = '';

    modal.classList.remove('hidden');
    // Pequeño delay para que la transición de opacidad funcione
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
// CARGA SILENCIOSA: ESTADÍSTICAS DEL DASHBOARD
// ─────────────────────────────────────────────────────────────
async function cargarEstadisticasDashboard() {
    try {
        const response = await fetchWithAuth(`${API_BASE}/api/usuarios`);
        if (!response.ok) return;

        const data = await response.json();
        if (!data.success || !data.usuarios) return;

        // Si la caché aún no tiene datos (el usuario no visitó la sección),
        // llenamos la caché también para que el buscador funcione luego.
        if (cachedUsuarios.length === 0) {
            cachedUsuarios = data.usuarios;
        }

        const totalAdmins = data.usuarios.filter(u => u.rol === 'administrador').length;
        const totalDocentes = data.usuarios.filter(u => u.rol === 'docente').length;

        const cardAdmins = document.getElementById('dash-total-admins');
        const cardDocentes = document.getElementById('dash-total-teachers');
        if (cardAdmins) cardAdmins.innerText = totalAdmins;
        if (cardDocentes) cardDocentes.innerText = totalDocentes;

    } catch (err) {
        console.warn('No se pudieron cargar estadísticas del dashboard:', err);
    }
}

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

    // ── Carga silenciosa de estadísticas para el Dashboard ─────
    // Corre al inicio para mostrar conteos reales sin necesidad
    // de que el usuario navegue a la sección de Usuarios.
    cargarEstadisticasDashboard();

    // ── Buscador de Usuarios ────────────────────────────────
    const searchInput = document.getElementById('user-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', filtrarUsuarios);
    }

    // ── Botón "Crear Usuario" ───────────────────────────────
    const btnAddUser = document.getElementById('btn-add-user');
    if (!btnAddUser) return;

    btnAddUser.addEventListener('click', async () => {
        const nombres = document.getElementById('user-first-name').value.trim();
        const apellidos = document.getElementById('user-last-name').value.trim();
        const email = document.getElementById('user-email').value.trim();
        const rol = document.getElementById('user-role').value;
        const estado = document.getElementById('user-status').value;
        const password = document.getElementById('user-password').value;

        if (!nombres || !apellidos || !email || !rol || !password || !estado) {
            Swal.fire({ title: 'Campos Incompletos', text: 'Completa todos los campos requeridos.', icon: 'warning', confirmButtonColor: '#9333ea' });
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            Swal.fire({ title: 'Email Inválido', text: 'Ingresa un correo electrónico válido.', icon: 'error', confirmButtonColor: '#EF4444' });
            return;
        }

        if (password.length < 6) {
            Swal.fire({ title: 'Contraseña Corta', text: 'La contraseña debe tener al menos 6 caracteres.', icon: 'warning', confirmButtonColor: '#9333ea' });
            return;
        }

        const textoOriginal = btnAddUser.innerHTML;
        btnAddUser.innerHTML = `<svg class="w-4 h-4 animate-spin inline mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Procesando...`;
        btnAddUser.disabled = true;

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                Swal.fire({ title: 'Sesión no válida', text: 'Inicia sesión nuevamente.', icon: 'error', confirmButtonColor: '#EF4444' });
                return;
            }

            const response = await fetchWithAuth(`${API_BASE}/api/crear_personal`, {
                method: 'POST',
                body: JSON.stringify({ nombres, apellidos, email, rol, password, estado })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                Swal.fire({ title: '¡Usuario Creado!', text: data.message, icon: 'success', confirmButtonColor: '#9333ea' });

                document.getElementById('user-first-name').value = '';
                document.getElementById('user-last-name').value = '';
                document.getElementById('user-email').value = '';
                document.getElementById('user-role').value = '';
                document.getElementById('user-status').value = 'activo';
                document.getElementById('user-password').value = '';

                cerrarModalCrearUsuario();
                await cargarYRenderizarUsuarios();

            } else {
                Swal.fire({ title: 'Error al Crear', text: data.message || 'No se pudo crear el usuario.', icon: 'error', confirmButtonColor: '#EF4444' });
            }

        } catch (error) {
            console.error('Error:', error);
            Swal.fire({ title: 'Error de Conexión', text: 'Ocurrió un error al conectar con el servidor.', icon: 'error', confirmButtonColor: '#EF4444' });
        } finally {
            btnAddUser.innerHTML = textoOriginal;
            btnAddUser.disabled = false;
        }
    });
});
