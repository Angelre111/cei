// =============================================================
// MÓDULO: PROMOCIÓN DE ESTUDIANTES (V2)
// Flujo segmentado por aula con modal de revisión.
// =============================================================

// --- Estado global del módulo ---
let _promPeriodos        = [];   // Todos los períodos
let _promSecciones       = [];   // Secciones del período destino (para dropdowns)
let _promAlumnos         = [];   // Alumnos de la sección origen cargada
// Mapa de estado por fila: { hijoId → { accion, seccionDestinoId } }
let _promAcciones        = {};
let _promSeccionOrigenInfo = null; // { id, nivel, nombre }

// =============================================================
// PASO 1 — CARGA DE PERÍODOS
// =============================================================

async function cargarDatosPromocion() {
    const selOrigen  = document.getElementById('prom-periodo-origen');
    const selDestino = document.getElementById('prom-periodo-destino');
    if (!selOrigen || !selDestino) return;

    try {
        const res  = await fetchWithAuth(`${API_BASE_URL}/api/periodos`);
        const data = await res.json();
        if (!res.ok || !data.success) return;

        _promPeriodos = data.periodos;
        const opts = _promPeriodos
            .map(p => `<option value="${p.id}">${p.nombre} (${p.estado})</option>`)
            .join('');

        selOrigen.innerHTML  = '<option value="">Seleccionar período...</option>' + opts;
        selDestino.innerHTML = '<option value="">Seleccionar período destino...</option>' + opts;

        // Pre-seleccionar el período activo como origen
        const activo = _promPeriodos.find(p => p.estado === 'activo');
        if (activo) selOrigen.value = activo.id;

        // Pre-seleccionar como destino el primero que NO sea activo
        const destino = _promPeriodos.find(p => p.id !== (activo?.id || ''));
        if (destino) selDestino.value = destino.id;

    } catch (err) {
        console.error('Error cargando períodos para promoción:', err);
    }
}

// =============================================================
// PASO 1b — CARGA DE SECCIONES ORIGEN (al elegir período origen)
// =============================================================

async function cargarSeccionesOrigen(periodoId) {
    const selSeccion = document.getElementById('prom-seccion-origen');
    if (!selSeccion) return;

    // Resetear tabla
    _resetTabla();

    if (!periodoId) {
        selSeccion.innerHTML  = '<option value="">— Primero elige un período —</option>';
        selSeccion.disabled   = true;
        selSeccion.className  = selSeccion.className.replace('bg-white text-gray-700', 'bg-gray-100 text-gray-400');
        return;
    }

    selSeccion.innerHTML = '<option value="">Cargando aulas...</option>';
    selSeccion.disabled  = true;

    try {
        const res  = await fetchWithAuth(`${API_BASE_URL}/api/secciones?periodo_id=${periodoId}`);
        const data = await res.json();

        if (!res.ok || !data.success || !data.secciones.length) {
            selSeccion.innerHTML = '<option value="">No hay secciones en este período</option>';
            return;
        }

        selSeccion.innerHTML = '<option value="">Seleccionar aula...</option>' +
            data.secciones.map(s =>
                `<option value="${s.id}" data-nivel="${s.nivel}" data-nombre="${s.nombre}">${s.nombre}</option>`
            ).join('');

        selSeccion.disabled  = false;
        selSeccion.classList.replace('bg-gray-100', 'bg-white');
        selSeccion.classList.replace('text-gray-400', 'text-gray-800');

    } catch (err) {
        console.error('Error cargando secciones:', err);
        selSeccion.innerHTML = '<option value="">Error al cargar aulas</option>';
    }
}

// =============================================================
// PASO 2 — CARGA DE ALUMNOS (al elegir aula + periodo destino)
// =============================================================

async function cargarAlumnosPorSeccion() {
    const seccionId   = document.getElementById('prom-seccion-origen')?.value;
    const periodoDestId = document.getElementById('prom-periodo-destino')?.value;

    if (!seccionId || !periodoDestId) {
        _resetTabla();
        return;
    }

    // Guardar info de la sección origen
    const selSec = document.getElementById('prom-seccion-origen');
    const opt    = selSec.options[selSec.selectedIndex];
    _promSeccionOrigenInfo = {
        id:     seccionId,
        nivel:  opt.dataset.nivel,
        nombre: opt.dataset.nombre || opt.text
    };

    const tbody = document.getElementById('prom-table-body');
    tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-12 text-center text-gray-400">
        <i class="ph ph-circle-notch animate-spin text-2xl mb-2 block"></i>
        Cargando alumnos del aula...
    </td></tr>`;

    document.getElementById('prom-tabla-container')?.classList.remove('hidden');
    document.getElementById('prom-empty-state')?.classList.add('hidden');

    try {
        // Cargar alumnos de la sección
        const resM  = await fetchWithAuth(`${API_BASE_URL}/api/matricula?seccion_id=${seccionId}`);
        const dataM = await resM.json();

        // Cargar TODAS las secciones del período destino (sin filtro de nivel)
        await _cargarSeccionesDestino(periodoDestId);

        if (!resM.ok || !dataM.success) {
            tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-12 text-center text-red-400">${dataM.message || 'Error al cargar alumnos'}</td></tr>`;
            return;
        }

        _promAlumnos  = dataM.matricula || [];
        _promAcciones = {};

        if (_promAlumnos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-12 text-center text-gray-400 italic font-medium">No hay alumnos activos en esta aula.</td></tr>`;
            _actualizarContadores();
            return;
        }

        // Pre-asignar "promover" a todos con la sección destino del nivel siguiente
        const jerarquia  = ['MATERNAL', '1ER GRUPO', '2DO GRUPO', '3ER GRUPO'];
        const nivelOrig  = _promSeccionOrigenInfo?.nivel || '';
        const idxNivel   = jerarquia.indexOf(nivelOrig);
        const nivelSig   = idxNivel >= 0 && idxNivel < jerarquia.length - 1 ? jerarquia[idxNivel + 1] : nivelOrig;
        // Primera sección del nivel siguiente en el período destino
        const secDefault = _promSecciones.find(s => s.nivel === nivelSig)?.id || _promSecciones[0]?.id || '';
        _promAlumnos.forEach(a => {
            _promAcciones[a.hijo_id] = {
                accion:           'promover',
                seccionDestinoId: secDefault
            };
        });

        _renderTablaPromocionV2();
        _actualizarContadores();
        document.getElementById('btn-iniciar-promocion').disabled = false;

        // Mostrar control masivo si hay secciones destino
        if (_promSecciones.length > 0) {
            document.getElementById('prom-bulk-control')?.classList.remove('hidden');
        }

    } catch (err) {
        console.error('Error cargando alumnos:', err);
        tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-12 text-center text-red-400">Error de conexión</td></tr>`;
    }
}

async function _cargarSeccionesDestino(periodoId) {
    try {
        // Cargamos TODAS las secciones del período destino sin filtro de nivel
        // El filtrado por nivel se hace por fila según la acción (promover/repetir)
        const res  = await fetchWithAuth(`${API_BASE_URL}/api/secciones?periodo_id=${periodoId}`);
        const data = await res.json();
        _promSecciones = (res.ok && data.success) ? data.secciones : [];

        // Llenar el dropdown masivo con secciones del nivel siguiente al origen
        const nivelOrigen = _promSeccionOrigenInfo?.nivel || '';
        const jerarquia   = ['MATERNAL', '1ER GRUPO', '2DO GRUPO', '3ER GRUPO'];
        const idxOrigen   = jerarquia.indexOf(nivelOrigen);
        const nivelSig    = idxOrigen >= 0 && idxOrigen < jerarquia.length - 1
            ? jerarquia[idxOrigen + 1] : nivelOrigen;

        const secsBulk = _promSecciones.filter(s => s.nivel === nivelSig);
        const bulkSel  = document.getElementById('prom-bulk-seccion');
        if (bulkSel) {
            bulkSel.innerHTML = secsBulk.length
                ? secsBulk.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')
                : '<option value="">Sin secciones para este nivel</option>';
        }
    } catch (_) {
        _promSecciones = [];
    }
}

// =============================================================
// RENDER DE TABLA
// =============================================================

function _optsParaAccion(accion, hijoId) {
    // Calcula qué secciones mostrar según la acción de la fila
    const jerarquia = ['MATERNAL', '1ER GRUPO', '2DO GRUPO', '3ER GRUPO'];
    const nivelOrigen = _promSeccionOrigenInfo?.nivel || '';
    const idxOrigen   = jerarquia.indexOf(nivelOrigen);

    let nivelesMostrar;
    if (accion === 'repetir') {
        // Mismo nivel y el siguiente (por si el admin quiere cambiarlos de aula dentro del mismo nivel)
        nivelesMostrar = [nivelOrigen];
        if (idxOrigen >= 0 && idxOrigen < jerarquia.length - 1) {
            nivelesMostrar.push(jerarquia[idxOrigen + 1]);
        }
    } else {
        // promover: nivel siguiente (y superior si hubiera)
        nivelesMostrar = idxOrigen >= 0 && idxOrigen < jerarquia.length - 1
            ? jerarquia.slice(idxOrigen + 1)
            : [nivelOrigen];
    }

    const secsF = _promSecciones.filter(s => nivelesMostrar.includes(s.nivel));
    if (!secsF.length) return '<option value="">Sin secciones disponibles</option>';

    // Agrupar con optgroup si hay varios niveles
    if ([...new Set(secsF.map(s => s.nivel))].length > 1) {
        const grupos = {};
        secsF.forEach(s => { (grupos[s.nivel] = grupos[s.nivel] || []).push(s); });
        return Object.entries(grupos).map(([niv, secs]) =>
            `<optgroup label="${niv}">${secs.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}</optgroup>`
        ).join('');
    }
    return secsF.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
}

function _renderTablaPromocionV2() {
    const tbody = document.getElementById('prom-table-body');
    if (!tbody) return;

    tbody.innerHTML = _promAlumnos.map((a) => {
        const est    = _promAcciones[a.hijo_id] || { accion: 'promover', seccionDestinoId: '' };
        const rowBg  = _colorFila(est.accion);
        const locked = est.accion === 'retirar';
        const nombre = a.estudiante || `${a.nombres || ''} ${a.apellidos || ''}`.trim();
        const cedula = a.cedula || a.cedula_escolar || 'N/A';
        // Opciones filtradas por nivel según la acción de cada fila
        const secOpts = locked ? '<option value="">No aplica</option>' : _optsParaAccion(est.accion, a.hijo_id);

        return `
        <tr id="prom-row-${a.hijo_id}" class="transition-colors duration-300 ${rowBg}">
            <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-600 text-sm flex-shrink-0">
                        ${nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p class="font-bold text-slate-800 leading-tight">${nombre}</p>
                        <p class="text-[10px] text-slate-400 uppercase tracking-widest">CI: ${cedula}</p>
                    </div>
                </div>
            </td>
            <td class="px-4 py-4 text-center">
                <select onchange="onAccionCambio('${a.hijo_id}')" id="prom-accion-${a.hijo_id}"
                    class="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-200 bg-white w-full transition-all">
                    <option value="promover" ${est.accion === 'promover' ? 'selected' : ''}>✅ Promover</option>
                    <option value="repetir"  ${est.accion === 'repetir'  ? 'selected' : ''}>⚠️ Repetir</option>
                    <option value="retirar"  ${est.accion === 'retirar'  ? 'selected' : ''}>🚫 Retirar</option>
                </select>
            </td>
            <td class="px-4 py-4 text-center">
                <select id="prom-destino-${a.hijo_id}" onchange="onSeccionCambio('${a.hijo_id}')"
                    ${locked ? 'disabled' : ''}
                    class="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-200 bg-white w-full transition-all ${locked ? 'opacity-40 cursor-not-allowed' : ''}">
                    ${secOpts}
                </select>
            </td>
        </tr>`;
    }).join('');

    document.getElementById('prom-count-total').textContent = `${_promAlumnos.length} Alumnos`;
}

// =============================================================
// INTERACCIONES
// =============================================================

function onAccionCambio(hijoId) {
    const selAccion = document.getElementById(`prom-accion-${hijoId}`);
    const selDest   = document.getElementById(`prom-destino-${hijoId}`);
    const row       = document.getElementById(`prom-row-${hijoId}`);
    if (!selAccion) return;

    const accion = selAccion.value;
    _promAcciones[hijoId] = _promAcciones[hijoId] || {};
    _promAcciones[hijoId].accion = accion;

    // Color de fila
    row.className = 'transition-colors duration-300 ' + _colorFila(accion);

    // Regenerar las opciones del destino según la nueva acción
    if (selDest) {
        const locked = accion === 'retirar';
        selDest.disabled = locked;
        selDest.classList.toggle('opacity-40', locked);
        selDest.classList.toggle('cursor-not-allowed', locked);

        if (locked) {
            selDest.innerHTML = '<option value="">No aplica</option>';
            _promAcciones[hijoId].seccionDestinoId = null;
        } else {
            // Reconstruir opciones filtradas por nivel según la acción
            const prevVal = _promAcciones[hijoId].seccionDestinoId || '';
            selDest.innerHTML = _optsParaAccion(accion, hijoId);
            // Intentar mantener la selección previa si sigue siendo válida
            if (prevVal && [...selDest.options].some(o => o.value === prevVal)) {
                selDest.value = prevVal;
            } else {
                // Auto-seleccionar la primera disponible
                selDest.selectedIndex = 0;
                _promAcciones[hijoId].seccionDestinoId = selDest.value || null;
            }
        }
    }

    _actualizarContadores();
}

function onSeccionCambio(hijoId) {
    const sel = document.getElementById(`prom-destino-${hijoId}`);
    if (sel && _promAcciones[hijoId]) {
        _promAcciones[hijoId].seccionDestinoId = sel.value;
    }
}

function aplicarSeccionMasiva() {
    const bulkSel = document.getElementById('prom-bulk-seccion');
    if (!bulkSel?.value) return;

    _promAlumnos.forEach(a => {
        if (_promAcciones[a.hijo_id]?.accion === 'promover') {
            _promAcciones[a.hijo_id].seccionDestinoId = bulkSel.value;
            const sel = document.getElementById(`prom-destino-${a.hijo_id}`);
            if (sel) sel.value = bulkSel.value;
        }
    });

    Swal.fire({ icon: 'success', title: 'Sección aplicada', timer: 1200, showConfirmButton: false });
}

function _colorFila(accion) {
    if (accion === 'repetir') return 'bg-amber-50/60';
    if (accion === 'retirar') return 'bg-red-50/60';
    return 'hover:bg-slate-50/50';
}

function _actualizarContadores() {
    const vals = Object.values(_promAcciones);
    document.getElementById('prom-count-promover').textContent = vals.filter(v => v.accion === 'promover').length;
    document.getElementById('prom-count-repetir').textContent  = vals.filter(v => v.accion === 'repetir').length;
    document.getElementById('prom-count-retirar').textContent  = vals.filter(v => v.accion === 'retirar').length;
}

function _resetTabla() {
    _promAlumnos  = [];
    _promAcciones = {};
    _promSecciones = [];
    document.getElementById('prom-tabla-container')?.classList.add('hidden');
    document.getElementById('prom-empty-state')?.classList.remove('hidden');
    document.getElementById('prom-bulk-control')?.classList.add('hidden');
    document.getElementById('btn-iniciar-promocion').disabled = true;
    ['prom-count-promover', 'prom-count-repetir', 'prom-count-retirar']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0'; });
}

// =============================================================
// MODAL DE REVISIÓN
// =============================================================

function abrirModalRevision() {
    const nPromover = Object.values(_promAcciones).filter(v => v.accion === 'promover').length;
    const nRepetir  = Object.values(_promAcciones).filter(v => v.accion === 'repetir').length;
    const nRetirar  = Object.values(_promAcciones).filter(v => v.accion === 'retirar').length;

    document.getElementById('modal-n-promover').textContent = nPromover;
    document.getElementById('modal-n-repetir').textContent  = nRepetir;
    document.getElementById('modal-n-retirar').textContent  = nRetirar;

    const aulaOrigen  = _promSeccionOrigenInfo?.nombre || 'Aula';
    const periodoOpts = document.getElementById('prom-periodo-destino');
    const periodoNombre = periodoOpts?.options[periodoOpts.selectedIndex]?.text || '';
    document.getElementById('modal-revision-subtitulo').textContent =
        `Aula: ${aulaOrigen}  →  Período: ${periodoNombre}`;

    // Lista de excepciones (Repetir + Retirar)
    const listaEl = document.getElementById('modal-excepciones-lista');
    const excepciones = _promAlumnos.filter(a => {
        const acc = _promAcciones[a.hijo_id]?.accion;
        return acc === 'repetir' || acc === 'retirar';
    });

    if (excepciones.length === 0) {
        listaEl.innerHTML = `
            <div class="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <i class="ph-bold ph-check-circle text-emerald-500 text-2xl"></i>
                <p class="text-sm font-bold text-emerald-700">✨ Todos los alumnos promueven. No hay excepciones.</p>
            </div>`;
    } else {
        listaEl.innerHTML = excepciones.map(a => {
            const acc    = _promAcciones[a.hijo_id]?.accion;
            const nombre = a.estudiante || `${a.nombres || ''} ${a.apellidos || ''}`.trim();
            const icon   = acc === 'retirar' ? '🚫' : '⚠️';
            const color  = acc === 'retirar' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-amber-50 border-amber-100 text-amber-700';
            const label  = acc === 'retirar' ? 'Retirar' : 'Repetir';
            return `
                <div class="flex items-center gap-3 px-4 py-3 ${color} rounded-xl border">
                    <span class="text-lg">${icon}</span>
                    <div class="flex-1">
                        <p class="font-bold text-sm">${nombre}</p>
                    </div>
                    <span class="text-xs font-black uppercase tracking-widest opacity-70">${label}</span>
                </div>`;
        }).join('');
    }

    // Mostrar modal con animación
    const modal   = document.getElementById('modal-revision-promocion');
    const content = document.getElementById('modal-revision-content');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.style.opacity  = '1';
        content.style.transform = 'scale(1)';
    });
}

function cerrarModalRevision() {
    const modal   = document.getElementById('modal-revision-promocion');
    const content = document.getElementById('modal-revision-content');
    modal.style.opacity     = '0';
    content.style.transform = 'scale(0.95)';
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// =============================================================
// CONFIRMAR Y PROCESAR
// =============================================================

async function confirmarYProcesar() {
    const btn = document.getElementById('btn-confirmar-promocion');
    btn.disabled   = true;
    btn.innerHTML  = '<i class="ph-bold ph-circle-notch animate-spin text-xl"></i> Procesando...';

    const periodoOrigenId  = document.getElementById('prom-periodo-origen').value;
    const periodoDestinoId = document.getElementById('prom-periodo-destino').value;
    const seccionOrigenId  = _promSeccionOrigenInfo?.id;

    const acciones = _promAlumnos.map(a => ({
        hijo_id:          a.hijo_id,
        accion:           _promAcciones[a.hijo_id]?.accion || 'promover',
        seccion_destino_id: _promAcciones[a.hijo_id]?.accion !== 'retirar'
            ? (_promAcciones[a.hijo_id]?.seccionDestinoId || null)
            : null
    }));

    try {
        const res  = await fetchWithAuth(`${API_BASE_URL}/api/promocion`, {
            method: 'POST',
            body: JSON.stringify({
                seccion_origen_id: seccionOrigenId,
                periodo_origen_id: periodoOrigenId,
                periodo_destino_id: periodoDestinoId,
                acciones
            })
        });
        const data = await res.json();

        cerrarModalRevision();

        if (res.ok && data.success) {
            mostrarModalResultados(data.resultados || []);
        } else {
            Swal.fire({
                title: 'No se pudo completar',
                text:  data.message || 'Error desconocido',
                icon:  'warning',
                confirmButtonColor: '#ef4444'
            });
        }
    } catch (err) {
        console.error('Error en confirmarYProcesar:', err);
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="ph-bold ph-check-circle text-xl"></i> Confirmar y Procesar Aula';
    }
}

function mostrarModalResultados(resultados) {
    const lista = document.getElementById('modal-resultados-lista');
    const titulo = document.getElementById('modal-resultados-titulo');
    const subtitulo = document.getElementById('modal-resultados-subtitulo');
    
    lista.innerHTML = '';
    
    let errores = 0;
    let omitidos = 0;
    let exitos = 0;

    resultados.forEach(res => {
        // Encontrar alumno para sacar el nombre real
        const alumno = _promAlumnos.find(a => a.hijo_id === res.hijo_id);
        const nombre = alumno ? (alumno.estudiante || `${alumno.nombres || ''} ${alumno.apellidos || ''}`.trim()) : 'Alumno Desconocido';
        
        let colorBg, colorText, iconHtml;
        
        if (!res.exito) {
            errores++;
            colorBg = 'bg-red-50 border-red-100';
            colorText = 'text-red-700';
            iconHtml = '<i class="ph-fill ph-warning-circle text-red-500 text-xl"></i>';
        } else if (res.omitido) {
            omitidos++;
            colorBg = 'bg-amber-50 border-amber-100';
            colorText = 'text-amber-700';
            iconHtml = '<i class="ph-fill ph-info text-amber-500 text-xl"></i>';
        } else {
            exitos++;
            colorBg = 'bg-emerald-50 border-emerald-100';
            colorText = 'text-emerald-700';
            iconHtml = '<i class="ph-fill ph-check-circle text-emerald-500 text-xl"></i>';
        }

        lista.innerHTML += `
            <div class="flex items-start gap-3 p-3 rounded-xl border ${colorBg}">
                <div class="mt-0.5 flex-shrink-0">${iconHtml}</div>
                <div>
                    <p class="font-bold text-sm ${colorText}">${nombre}</p>
                    <p class="text-xs text-gray-600 mt-0.5">${res.status}</p>
                </div>
            </div>
        `;
    });

    if (errores === 0 && omitidos === 0) {
        titulo.innerHTML = '<i class="ph-bold ph-check-circle text-emerald-500 text-3xl"></i> <span>¡Promoción Exitosa!</span>';
        subtitulo.textContent = 'Todos los alumnos fueron procesados correctamente.';
    } else if (errores > 0) {
        titulo.innerHTML = '<i class="ph-bold ph-warning-octagon text-red-500 text-3xl"></i> <span class="text-red-600">Proceso Fallido</span>';
        subtitulo.textContent = `Se encontraron ${errores} error(es) durante el proceso.`;
    } else {
        titulo.innerHTML = '<i class="ph-bold ph-warning text-amber-500 text-3xl"></i> <span class="text-amber-600">Completado con Omitidos</span>';
        subtitulo.textContent = 'Algunos alumnos ya se encontraban asignados previamente.';
    }

    const modal = document.getElementById('modal-resultados-promocion');
    const content = document.getElementById('modal-resultados-content');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.style.opacity  = '1';
        content.style.transform = 'scale(1)';
    });
}

function cerrarModalResultados() {
    const modal = document.getElementById('modal-resultados-promocion');
    const content = document.getElementById('modal-resultados-content');
    modal.style.opacity = '0';
    content.style.transform = 'scale(0.95)';
    setTimeout(() => {
        modal.classList.add('hidden');
        // Limpiar estado y resetear para la siguiente aula
        _resetTabla();
        const selectOrigen = document.getElementById('prom-seccion-origen');
        if (selectOrigen) selectOrigen.value = '';
    }, 300);
}

// =============================================================
// INIT
// =============================================================

document.addEventListener('DOMContentLoaded', () => {
    const secPromocion = document.getElementById('section-promocion');

    // Cargar períodos cuando la sección se vuelve visible
    if (secPromocion) {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                if (m.attributeName === 'class' && !secPromocion.classList.contains('hidden')) {
                    cargarDatosPromocion();
                }
            });
        });
        observer.observe(secPromocion, { attributes: true });

        if (!secPromocion.classList.contains('hidden')) {
            cargarDatosPromocion();
        }
    }

    // Listener: Período Origen → cargar secciones
    document.getElementById('prom-periodo-origen')?.addEventListener('change', e => {
        cargarSeccionesOrigen(e.target.value);
    });

    // Listener: Sección origen o Período destino → cargar alumnos
    document.getElementById('prom-seccion-origen')?.addEventListener('change', cargarAlumnosPorSeccion);
    document.getElementById('prom-periodo-destino')?.addEventListener('change', cargarAlumnosPorSeccion);

    // Cerrar modal al hacer click fuera
    document.getElementById('modal-revision-promocion')?.addEventListener('click', e => {
        if (e.target.id === 'modal-revision-promocion') cerrarModalRevision();
    });
});
