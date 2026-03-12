// ============================================================
// admin_users.js — Gestión de Usuarios del Panel Administrativo
// ============================================================

const API_BASE = window.API_BASE_URL || '';
let cachedUsuarios = []; // Cache para búsqueda local

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
        const response = await fetchWithAuth(`${API_BASE}/api/usuarios`);

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
// RENDERIZAR FILAS EN LA TABLA
// ─────────────────────────────────────────────────────────────
function renderizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('user-table-body');
    tbody.innerHTML = '';

    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-10 text-center text-gray-400 text-sm">
                    ${document.getElementById('user-search-input')?.value ? 'No se encontraron usuarios que coincidan con la búsqueda.' : 'No hay usuarios registrados todavía.'}
                </td>
            </tr>`;
        return;
    }

    // ID del usuario actual (no puede eliminarse a sí mismo)
    const currentUserId = localStorage.getItem('user_id') || '';

    let html = '';

    usuarios.forEach(u => {
        const nombreCompleto = `${u.nombres || ''} ${u.apellidos || ''}`.trim();
        const inicial = nombreCompleto.charAt(0).toUpperCase();

        const rolDisplay = u.rol === 'administrador' ? 'Administrador' : 'Docente';
        const rolBadge = u.rol === 'administrador'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-pink-100 text-pink-700';

        const estadoDisplay = u.estado
            ? u.estado.charAt(0).toUpperCase() + u.estado.slice(1)
            : 'Desconocido';

        const estadoConfig = {
            activo: { dot: 'bg-green-500', text: 'text-green-700' },
            pendiente: { dot: 'bg-yellow-500', text: 'text-yellow-700' },
            inactivo: { dot: 'bg-red-400', text: 'text-red-700' },
        };
        const estilo = estadoConfig[u.estado] || { dot: 'bg-gray-400', text: 'text-gray-600' };

        // El admin no puede eliminarse a sí mismo
        const esMismoUsuario = u.id === currentUserId;

        html += `
            <tr class="hover:bg-gray-50 border-b border-gray-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                            ${inicial}
                        </div>
                        <div>
                            <p class="font-medium text-gray-800 leading-none">${nombreCompleto}</p>
                            <p class="text-xs text-gray-400 mt-0.5">${u.email}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${rolBadge}">
                        ${rolDisplay}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <span class="flex items-center gap-1.5 text-sm ${estilo.text}">
                        <span class="w-2 h-2 rounded-full ${estilo.dot}"></span>
                        ${estadoDisplay}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <!-- Botón Editar: data-* evita break por comillas en nombres -->
                        <button
                            data-user-id="${u.id}"
                            data-nombres="${u.nombres}"
                            data-apellidos="${u.apellidos}"
                            data-email="${u.email}"
                            data-estado="${u.estado}"
                            data-rol="${u.rol}"
                            data-es-mismo-usuario="${esMismoUsuario}"
                            onclick="abrirModalEditarDesdeBtn(this)"
                            title="Editar usuario"
                            class="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <!-- Botón Eliminar -->
                        <button
                            data-user-id="${u.id}"
                            data-nombre-completo="${nombreCompleto}"
                            onclick="${esMismoUsuario ? '' : 'confirmarEliminarDesdeBtn(this)'}"
                            title="${esMismoUsuario ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}"
                            ${esMismoUsuario ? 'disabled' : ''}
                            class="p-1.5 rounded-lg transition ${esMismoUsuario
                ? 'text-gray-200 cursor-not-allowed'
                : 'text-red-400 hover:text-red-600 hover:bg-red-50'}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
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
        btn.dataset.esMismoUsuario === 'true'
    );
}
function confirmarEliminarDesdeBtn(btn) {
    confirmarEliminar(btn.dataset.userId, btn.dataset.nombreCompleto);
}

// ─────────────────────────────────────────────────────────────
// ACCIÓN: EDITAR USUARIO — Modal SweetAlert2
// ─────────────────────────────────────────────────────────────
async function abrirModalEditar(userId, nombres, apellidos, email, estadoActual, rolActual, esMismoUsuario = false) {
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
