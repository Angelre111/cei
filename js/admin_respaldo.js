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
            fuenteEl.textContent = data.fuente === 'drive' ? '☁️ Google Drive' : '💾 Local (AES-256)';
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
                : `<span class="px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 text-[10px] font-black border border-sky-100">☁️ Drive</span>`;

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
                    ${data.fuente === 'drive' ? 
                        `<button onclick="restaurarRespaldo('${arch.drive_id}', '${arch.nombre}')" class="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 ml-auto">
                            <i class="ph-bold ph-arrows-counter-clockwise"></i> Restaurar
                        </button>` 
                        : '<span class="text-[10px] text-slate-400">Solo Local</span>'}
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

// ─── Restaurar Respaldo (A prueba de Directores) ──────────
async function restaurarRespaldo(fileId, fileName) {
    const confirm = await Swal.fire({
        title: '¿Restaurar este punto?',
        html: `
            <p class="text-slate-600 text-sm mb-2">Vas a restaurar el archivo <strong>${fileName}</strong>.</p>
            <div class="p-3 bg-amber-50 rounded-xl text-xs text-amber-800 font-medium text-left border border-amber-200">
                ⚠️ <strong>Aviso:</strong> Esta acción recuperará datos que hayan sido eliminados por accidente sin alterar la información que existe actualmente en el sistema.
            </div>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '🔄 Sí, Restaurar',
        cancelButtonText: 'Cancelar',
        borderRadius: '1.5rem'
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({
        title: 'Restaurando...',
        html: 'Este proceso puede tardar unos segundos. Por favor, no cierres esta ventana.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/restaurar-respaldo/${fileId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Restauración Exitosa!',
                text: data.message,
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

// ─── Respaldo Manual ──────────────────────────────────────
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
                💾 En local: se guarda en <code>C:\\Respaldos_CEI\\</code> encriptado con AES-256
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
