/**
 * admin_respaldo.js
 * Panel de Respaldo de Datos — CEI La Paragua
 * Maneja el respaldo manual, el historial y la información del estado del sistema.
 */

// ─── Estado del módulo ──────────────────────────────────────
let _historialCache = [];
let _historialCargado = false;

// ─── Inicialización ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Se cargará solo cuando el usuario navegue a la sección
    document.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'section-respaldo') {
            initRespaldoPanel();
        }
    });
});

async function initRespaldoPanel() {
    actualizarHoraLocal();
    await cargarHistorialRespaldos();
}

// ─── Hora local en tiempo real ────────────────────────────
function actualizarHoraLocal() {
    const el = document.getElementById('respaldo-hora-actual');
    if (!el) return;
    const actualizar = () => {
        const ahora = new Date();
        el.textContent = ahora.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    actualizar();
    setInterval(actualizar, 1000);
}

// ─── Cargar historial de respaldos ────────────────────────
async function cargarHistorialRespaldos() {
    const tbody = document.getElementById('respaldo-historial-body');
    const contadorEl = document.getElementById('respaldo-contador');
    const ultimoNombreEl = document.getElementById('respaldo-ultimo-nombre');
    const ultimoFechaEl = document.getElementById('respaldo-ultimo-fecha');
    const ultimoTamEl = document.getElementById('respaldo-ultimo-tam');
    const fuenteEl = document.getElementById('respaldo-fuente-label');

    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="px-6 py-8 text-center text-slate-400 text-sm">
                <div class="flex items-center justify-center gap-2">
                    <div class="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                    Cargando historial...
                </div>
            </td>
        </tr>`;

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/backup-historial`);
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.message || 'Error al obtener historial');
        }

        _historialCache = data.archivos || [];
        _historialCargado = true;

        // Actualizar fuente
        if (fuenteEl) {
            fuenteEl.textContent = data.fuente === 'drive' ? '☁️ Google Drive' : '💾 Local';
        }

        // Actualizar contador
        if (contadorEl) {
            contadorEl.textContent = `${_historialCache.length} respaldo${_historialCache.length !== 1 ? 's' : ''}`;
        }

        // Actualizar info del último respaldo
        if (_historialCache.length > 0) {
            const ultimo = _historialCache[0];
            if (ultimoNombreEl) ultimoNombreEl.textContent = ultimo.nombre || '—';
            if (ultimoTamEl) ultimoTamEl.textContent = ultimo.tamanio || '—';
            if (ultimoFechaEl) {
                const fecha = new Date(ultimo.fecha);
                ultimoFechaEl.textContent = isNaN(fecha)
                    ? ultimo.fecha
                    : fecha.toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
            }
        } else {
            if (ultimoNombreEl) ultimoNombreEl.textContent = 'Ninguno aún';
            if (ultimoFechaEl) ultimoFechaEl.textContent = '—';
            if (ultimoTamEl) ultimoTamEl.textContent = '—';
        }

        // Renderizar tabla
        if (_historialCache.length === 0) {
            const msg = data.mensaje || 'No hay respaldos registrados. Ejecuta el primer respaldo.';
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-10 text-center text-slate-400 text-sm">${msg}</td>
                </tr>`;
            return;
        }

        tbody.innerHTML = _historialCache.map((arch, i) => {
            const fecha = new Date(arch.fecha);
            const fechaStr = isNaN(fecha)
                ? arch.fecha
                : fecha.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
            const tipoBadge = arch.tipo === 'manual'
                ? `<span class="px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[10px] font-black uppercase border border-purple-100">Manual</span>`
                : `<span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase border border-blue-100">Auto</span>`;

            const encryptBadge = arch.encriptado
                ? `<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black border border-emerald-100">🔒 AES-256</span>`
                : (data.fuente === 'drive'
                    ? `<span class="px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 text-[10px] font-black border border-sky-100">☁️ Drive</span>`
                    : `<span class="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[10px] font-black border border-slate-100">💾 Local</span>`);

            const fileIdForRestore = data.fuente === 'drive' ? arch.drive_id : arch.nombre;

            return `
            <tr class="hover:bg-slate-50/70 transition-colors ${i === 0 ? 'bg-emerald-50/30' : ''}">
                <td class="px-5 py-3.5 text-[13px] font-semibold text-slate-700 whitespace-nowrap">
                    ${i === 0 ? '<span class="mr-1.5 text-emerald-500">●</span>' : '<span class="mr-1.5 text-slate-200">●</span>'}
                    ${fechaStr}
                </td>
                <td class="px-5 py-3.5 text-[13px] text-slate-500 font-mono text-xs">${arch.nombre}</td>
                <td class="px-5 py-3.5 text-[13px] text-slate-500">${arch.tamanio}</td>
                <td class="px-5 py-3.5">${tipoBadge}</td>
                <td class="px-5 py-3.5">${encryptBadge}</td>
                <td class="px-5 py-3.5 text-right">
                    <button onclick="restaurarRespaldo('${fileIdForRestore}', '${arch.nombre}')" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 ml-auto">
                        <i class="ph-bold ph-arrows-counter-clockwise"></i> Restaurar
                    </button>
                </td>
            </tr>`;
        }).join('');

    } catch (err) {
        console.error('Error cargando historial:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-8 text-center text-red-400 text-sm">
                    Error al cargar historial: ${err.message}
                </td>
            </tr>`;
    }
}

// ─── Restaurar Respaldo ────────────────────────────────────────────
async function restaurarRespaldo(fileId, fileName) {

    // ── Paso 1: Seleccionar el modo de restauración ──
    const modoResult = await Swal.fire({
        title: '¿Restaurar este punto?',
        html: `
            <p class="text-slate-600 text-sm mb-4">Archivo: <strong class="font-mono text-xs">${fileName}</strong></p>

            <div class="flex flex-col gap-3 text-left">
                <label id="lbl-modo-estandar"
                    class="flex items-start gap-3 p-3.5 rounded-2xl border-2 border-blue-400 bg-blue-50 cursor-pointer transition-all"
                    onclick="_seleccionarModoRestauracion('estandar')">
                    <input type="radio" name="modo-restauracion" value="estandar" checked class="mt-0.5 accent-blue-500">
                    <div>
                        <p class="font-black text-slate-800 text-sm">Estándar <span class="ml-1 text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Recomendado</span></p>
                        <p class="text-xs text-slate-500 mt-0.5">Recupera datos borrados (asistencias, proyectos, estudiantes…) <strong>sin alterar</strong> los usuarios ni sus estados actuales.</p>
                    </div>
                </label>

                <label id="lbl-modo-completo"
                    class="flex items-start gap-3 p-3.5 rounded-2xl border-2 border-slate-200 bg-slate-50 cursor-pointer transition-all"
                    onclick="_seleccionarModoRestauracion('completo')">
                    <input type="radio" name="modo-restauracion" value="completo" class="mt-0.5 accent-rose-500">
                    <div>
                        <p class="font-black text-slate-800 text-sm">Completa <span class="ml-1 text-[10px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Incluye usuarios</span></p>
                        <p class="text-xs text-slate-500 mt-0.5">Restaura <strong>también</strong> los estados de usuarios. Úsalo si desactivaste un docente por error y quieres revertirlo al estado del respaldo.</p>
                    </div>
                </label>
            </div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '🔄 Continuar',
        cancelButtonText: 'Cancelar',
        borderRadius: '1.5rem'
    });

    if (!modoResult.isConfirmed) return;

    // Leer el modo seleccionado
    const modoSeleccionado = document.querySelector('input[name="modo-restauracion"]:checked')?.value || 'estandar';
    const incluirUsuarios = modoSeleccionado === 'completo';

    // ── Paso 2: Confirmación adicional para modo completo ──
    if (incluirUsuarios) {
        const confirmFinal = await Swal.fire({
            title: '⚠️ Confirmación adicional',
            html: `
                <p class="text-slate-600 text-sm mb-3">
                    Restaurarás <strong>incluyendo la tabla de usuarios</strong>.
                </p>
                <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium text-left">
                    Los estados actuales de los usuarios serán sobreescritos con los del respaldo.
                    Los usuarios creados <em>después</em> del respaldo <strong>no se eliminarán</strong>.
                </div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: '⚠️ Sí, restaurar todo',
            cancelButtonText: 'Cancelar',
            borderRadius: '1.5rem'
        });
        if (!confirmFinal.isConfirmed) return;
    }

    // ── Paso 3: Ejecutar restauración ──
    Swal.fire({
        title: incluirUsuarios ? 'Restauración Completa...' : 'Restaurando...',
        html: 'Este proceso puede tardar unos segundos. Por favor, no cierres esta ventana.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/restaurar-respaldo/${fileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incluir_usuarios: incluirUsuarios })
        });
        const data = await res.json();

        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Restauración Exitosa!',
                html: `
                    <p class="text-slate-600 text-sm">${data.message}</p>
                    ${incluirUsuarios
                        ? `<div class="mt-3 p-3 bg-blue-50 rounded-xl text-xs text-blue-700 font-medium">
                               Los estados de usuarios fueron restaurados al punto del respaldo.
                           </div>`
                        : ''}`,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'Aceptar'
            });
        } else {
            throw new Error(data.message || 'Error desconocido');
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error en Restauración',
            text: err.message || 'No se pudo completar la restauración.',
            confirmButtonColor: '#ef4444'
        });
    }
}

/** Resalta visualmente la opción de modo seleccionada en el diálogo. */
function _seleccionarModoRestauracion(modo) {
    const lblEstandar = document.getElementById('lbl-modo-estandar');
    const lblCompleto = document.getElementById('lbl-modo-completo');
    const radioEstandar = document.querySelector('input[name="modo-restauracion"][value="estandar"]');
    const radioCompleto = document.querySelector('input[name="modo-restauracion"][value="completo"]');
    if (!lblEstandar || !lblCompleto) return;
    if (modo === 'estandar') {
        lblEstandar.style.borderColor = '#60a5fa';
        lblEstandar.style.backgroundColor = '#eff6ff';
        lblCompleto.style.borderColor = '#e2e8f0';
        lblCompleto.style.backgroundColor = '#f8fafc';
        if (radioEstandar) radioEstandar.checked = true;
    } else {
        lblCompleto.style.borderColor = '#60a5fa';
        lblCompleto.style.backgroundColor = '#eff6ff';
        lblEstandar.style.borderColor = '#e2e8f0';
        lblEstandar.style.backgroundColor = '#f8fafc';
        if (radioCompleto) radioCompleto.checked = true;
    }
}

async function ejecutarRespaldoManual() {
    const btn = document.getElementById('btn-respaldo-manual');
    const iconEl = document.getElementById('btn-respaldo-icon');
    const textEl = document.getElementById('btn-respaldo-text');

    if (!btn) return;

    // Confirmar
    const confirm = await Swal.fire({
        title: '¿Generar respaldo ahora?',
        html: `
            <p class="text-slate-600 text-sm">Se generará una copia de seguridad completa de la base de datos.</p>
            <div class="mt-3 p-3 bg-blue-50 rounded-xl text-xs text-blue-700 font-medium text-left">
                ☁️ En producción: se sube a Google Drive<br>
                💾 En local: se guarda en <code>C:\\Respaldos_CEI\\</code> en formato SQL
            </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '✅ Sí, respaldar',
        cancelButtonText: 'Cancelar',
        borderRadius: '1.5rem'
    });

    if (!confirm.isConfirmed) return;

    // Estado de carga
    btn.disabled = true;
    if (iconEl) iconEl.className = 'ph-bold ph-spinner-gap text-xl animate-spin';
    if (textEl) textEl.textContent = 'Generando respaldo...';

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/backup-manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Respaldo Completado!',
                html: `
                    <p class="text-slate-600 text-sm mb-2">${data.message}</p>
                    ${data.archivo ? `<div class="p-3 bg-slate-50 rounded-xl text-xs font-mono text-slate-500 break-all">${data.archivo}</div>` : ''}
                    ${data.tamanio_kb ? `<p class="mt-2 text-xs text-slate-400">Tamaño: ${data.tamanio_kb} KB</p>` : ''}`,
                confirmButtonColor: '#10b981',
                confirmButtonText: '✅ Perfecto'
            });
            // Recargar historial con un pequeño delay
            setTimeout(cargarHistorialRespaldos, 1500);
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error en el respaldo',
                text: data.message || 'Ocurrió un error inesperado.',
                confirmButtonColor: '#ef4444'
            });
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Error de conexión',
            text: 'No se pudo conectar al servidor. Verifica que la app esté corriendo.',
            confirmButtonColor: '#ef4444'
        });
    } finally {
        btn.disabled = false;
        if (iconEl) iconEl.className = 'ph-bold ph-database-backup text-xl';
        if (textEl) textEl.textContent = 'Generar Respaldo Manual';
    }
}

// =============================================================
// RECUPERACIÓN DE EMERGENCIA — DOCENTES ARCHIVADOS
// =============================================================

/**
 * Abre el modal y carga la lista de docentes archivados.
 * También actualiza el badge del botón de emergencia.
 */
async function abrirModalDocentesArchivados() {
    const modal = document.getElementById('modal-docentes-archivados');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    await _cargarDocentesArchivados();
}

function cerrarModalDocentesArchivados() {
    const modal = document.getElementById('modal-docentes-archivados');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Cerrar modal al hacer click fuera del contenido
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-docentes-archivados');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrarModalDocentesArchivados();
        });
    }
    // Actualizar badge al cargar la sección de respaldo
    document.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'section-respaldo') {
            _actualizarBadgeArchivados();
        }
    });
});

async function _cargarDocentesArchivados() {
    const contenedor = document.getElementById('lista-docentes-archivados');
    if (!contenedor) return;

    contenedor.innerHTML = `
        <div class="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
            <div class="w-4 h-4 border-2 border-slate-300 border-t-rose-400 rounded-full animate-spin"></div>
            Consultando el archivo...
        </div>`;

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/docentes-archivados`);
        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Error al consultar archivo');

        const archivados = data.archivados || [];

        // Actualizar badge
        _actualizarBadgeDesdeLista(archivados.length);

        if (archivados.length === 0) {
            contenedor.innerHTML = `
                <div class="flex flex-col items-center gap-3 py-12 text-slate-400">
                    <i class="ph-fill ph-check-circle text-4xl text-emerald-300"></i>
                    <p class="text-sm font-semibold">No hay docentes archivados</p>
                    <p class="text-xs text-center">Todos los docentes eliminados físicamente han sido<br>reactivados o no existían registros para respaldar.</p>
                </div>`;
            return;
        }

        contenedor.innerHTML = archivados.map(doc => {
            const fechaArchivado = new Date(doc.archivado_en);
            const fechaStr = isNaN(fechaArchivado)
                ? doc.archivado_en
                : fechaArchivado.toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });

            const nombreCompleto = [doc.nombres, doc.apellidos].filter(Boolean).join(' ') || 'Nombre no disponible';

            return `
            <div class="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-rose-200 hover:bg-rose-50/30 transition-colors" id="archi-card-${doc.id}">
                <!-- Avatar -->
                <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-400 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <i class="ph-bold ph-chalkboard-teacher text-white text-lg"></i>
                </div>
                <!-- Info -->
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-black text-slate-800 truncate">${nombreCompleto}</p>
                    <p class="text-xs text-slate-500 font-medium truncate">${doc.email || 'Sin email'}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">Eliminado el ${fechaStr}</p>
                </div>
                <!-- Estado badge -->
                <span class="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black border border-rose-100 whitespace-nowrap flex-shrink-0">
                    Sin acceso
                </span>
                <!-- Botón reactivar -->
                <button
                    id="btn-reactivar-${doc.id}"
                    onclick="reactivarDocente('${doc.id}', '${nombreCompleto.replace(/'/g, "\\'")}', '${doc.email || ''}')"
                    class="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-black text-xs shadow-sm hover:from-emerald-600 hover:to-teal-600 hover:-translate-y-0.5 transition-all flex items-center gap-1.5 flex-shrink-0">
                    <i class="ph-bold ph-arrow-counter-clockwise text-sm"></i>
                    Reactivar
                </button>
            </div>`;
        }).join('');

    } catch (err) {
        contenedor.innerHTML = `
            <div class="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">
                <i class="ph-bold ph-warning text-lg flex-shrink-0"></i>
                <span>${err.message || 'Error al cargar el archivo de docentes.'}</span>
            </div>`;
    }
}

async function reactivarDocente(archivoId, nombre, email) {
    const confirm = await Swal.fire({
        title: `¿Reactivar a ${nombre}?`,
        html: `
            <p class="text-slate-600 text-sm mb-3">
                Se reconstruirá la cuenta de acceso de <strong>${nombre}</strong>
                (${email}) en el sistema.
            </p>
            <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 font-medium text-left space-y-1">
                <p>✅ Se crea una nueva cuenta de autenticación</p>
                <p>✅ Se vincula con sus datos históricos en la base de datos</p>
                <p>📧 Se envía un correo de restablecimiento de contraseña a <strong>${email}</strong></p>
            </div>
            <p class="mt-3 text-xs text-slate-400">Asegúrate de haber restaurado el respaldo antes de reactivar.</p>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '🔄 Sí, Reactivar',
        cancelButtonText: 'Cancelar',
        borderRadius: '1.5rem'
    });

    if (!confirm.isConfirmed) return;

    // Estado de carga en el botón
    const btn = document.getElementById(`btn-reactivar-${archivoId}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Reactivando...`;
    }

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/reactivar-docente/${archivoId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            // Remover la tarjeta del docente reactivado con animación
            const card = document.getElementById(`archi-card-${archivoId}`);
            if (card) {
                card.style.transition = 'all 0.3s ease';
                card.style.opacity = '0';
                card.style.transform = 'translateX(20px)';
                setTimeout(() => card.remove(), 300);
            }

            Swal.fire({
                icon: 'success',
                title: '¡Docente Reactivado!',
                html: `<p class="text-slate-600 text-sm">${data.message}</p>`,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'Perfecto'
            });

            // Actualizar badge
            setTimeout(_actualizarBadgeArchivados, 600);
        } else {
            throw new Error(data.message || 'Error desconocido');
        }
    } catch (err) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="ph-bold ph-arrow-counter-clockwise text-sm"></i> Reactivar`;
        }
        Swal.fire({
            icon: 'error',
            title: 'Error al Reactivar',
            html: `<p class="text-slate-600 text-sm">${err.message}</p>`,
            confirmButtonColor: '#ef4444'
        });
    }
}

/** Consulta la cantidad de archivados y actualiza el badge del botón. */
async function _actualizarBadgeArchivados() {
    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/docentes-archivados`);
        const data = await res.json();
        if (data.success) {
            _actualizarBadgeDesdeLista((data.archivados || []).length);
        }
    } catch (_) { /* silencioso */ }
}

function _actualizarBadgeDesdeLista(count) {
    const badge = document.getElementById('badge-archivados');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}
