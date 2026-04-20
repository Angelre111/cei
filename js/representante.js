// ============================================================
// PORTAL DE REPRESENTANTES — representante.js
// Maneja toda la lógica interactiva del portal familiar
// ============================================================

'use strict';

// ▸ Estado Global de la Aplicación
const AppState = {
    token: null,
    perfil: null,       // datos del representante
    hijos: [],          // lista de hijos
    hijoActivo: null,   // objeto del hijo seleccionado
    fichaCache: {},     // cache de fichas { hijo_id: fichaData }
    progresoCache: {},  // cache de progreso { hijo_id: progresoData }
    asistenciaCache:{}, // cache de asistencias { hijo_id: data }
    comunicados: [],    // lista de comunicados
};

const BASE_URL = typeof API_BASE_URL !== 'undefined'
    ? API_BASE_URL
    : 'http://127.0.0.1:5000';


// ============================================================
// 1. INIT APP — Punto de entrada
// ============================================================
async function initApp() {
    AppState.token = localStorage.getItem('auth_token');
    if (!AppState.token) {
        window.location.replace('login.html');
        return;
    }

    mostrarEstadoCargaGlobal(true);
    try {
        await cargarPerfilRepresentante();
        await cargarComunicados();

        if (AppState.hijos.length > 0) {
            await renderHijo(AppState.hijos[0].id);
        }
    } catch (err) {
        console.error('❌ initApp error:', err);
        Swal.fire({
            icon: 'error',
            title: 'Error de conexión',
            text: 'No se pudieron cargar los datos. Verifica tu conexión.',
            confirmButtonColor: '#EC4899'
        });
    } finally {
        mostrarEstadoCargaGlobal(false);
    }
}

function mostrarEstadoCargaGlobal(loading) {
    const splash = document.getElementById('splash-loader');
    if (!splash) return;
    if (loading) {
        splash.classList.remove('hidden');
    } else {
        splash.classList.add('hidden');
    }
}


// ============================================================
// 2. CARGAR PERFIL DEL REPRESENTANTE
// ============================================================
async function cargarPerfilRepresentante() {
    const res = await fetch(`${BASE_URL}/api/representante/perfil`, {
        headers: { 'Authorization': `Bearer ${AppState.token}` }
    });

    if (!res.ok) throw new Error('Error al obtener perfil');
    const data = await res.json();

    if (!data.success) throw new Error(data.message);

    AppState.perfil = data.perfil;
    AppState.hijos = data.hijos || [];

    // Actualizar UI del header
    let nombreRep = `${data.perfil.nombres || ''} ${data.perfil.apellidos || ''}`.trim();
    if (!nombreRep) nombreRep = "Representante";

    document.querySelectorAll('.rep-nombre').forEach(el => el.textContent = nombreRep);
    document.querySelectorAll('.rep-inicial').forEach(el => {
        const inicial = data.perfil.nombres ? data.perfil.nombres[0].toUpperCase() : 'R';
        el.textContent = inicial;
    });

    // Pre-llenar formulario de datos personales
    const emailEl = document.getElementById('perfil-email');
    if (emailEl) emailEl.value = data.perfil.email || '';

    // Construir el selector de hijo si hay más de uno
    renderSelectorHijos();
}


// ============================================================
// 3. RENDERIZAR SELECTOR DE HIJOS (Switch en header)
// ============================================================
function renderSelectorHijos() {
    const container = document.getElementById('hijo-switcher-container');
    if (!container) return;

    const hijos = AppState.hijos;

    if (hijos.length <= 1) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = hijos.map((h, idx) => `
        <button
            id="btn-hijo-${h.id}"
            onclick="renderHijo(${h.id})"
            class="hijo-switch-btn relative flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200
                   ${idx === 0 ? 'bg-white text-pink-600 shadow-md' : 'text-white/70 hover:text-white'}"
        >
            <div class="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                ${h.nombres[0]?.toUpperCase() || '?'}
            </div>
            <span class="hidden sm:inline">${h.nombres}</span>
        </button>
    `).join('');
}


// ============================================================
// 4. RENDER HIJO — Actualiza toda la UI para el hijo seleccionado
// ============================================================
async function renderHijo(hijoId) {
    const hijo = AppState.hijos.find(h => h.id === hijoId);
    if (!hijo) return;

    AppState.hijoActivo = hijo;

    // Marcar botón activo en el switcher
    document.querySelectorAll('.hijo-switch-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-pink-600', 'shadow-md');
        btn.classList.add('text-white/70');
    });
    const btnActivo = document.getElementById(`btn-hijo-${hijoId}`);
    if (btnActivo) {
        btnActivo.classList.add('bg-white', 'text-pink-600', 'shadow-md');
        btnActivo.classList.remove('text-white/70');
    }

    // Actualizar encabezado
    const nombreCompleto = `${hijo.nombres} ${hijo.apellidos}`;
    document.querySelectorAll('.hijo-nombre').forEach(el => el.textContent = nombreCompleto);
    document.querySelectorAll('.hijo-nombres').forEach(el => el.textContent = hijo.nombres);
    document.querySelectorAll('.hijo-seccion').forEach(el => el.textContent = hijo.seccion || 'Sin sección');
    document.querySelectorAll('.hijo-inicial').forEach(el => {
        el.textContent = hijo.nombres[0]?.toUpperCase() || '?';
    });
    document.querySelectorAll('.hijo-avatar-text').forEach(el => {
        el.textContent = hijo.nombres[0]?.toUpperCase() || '?';
    });

    // Cargar datos asíncronamente en paralelo
    Promise.all([
        cargarFichaHijo(hijoId),
        cargarProgresoHijo(hijoId),
        cargarAsistenciaHijo(hijoId),
    ]).catch(e => console.error('Error cargando datos hijo:', e));
}


// ============================================================
// 5. FICHA DEL ALUMNO (solo lectura)
// ============================================================
async function cargarFichaHijo(hijoId) {
    if (AppState.fichaCache[hijoId]) {
        renderizarFicha(AppState.fichaCache[hijoId]);
        return;
    }

    const fichaContainer = document.getElementById('ficha-container');
    if (fichaContainer) fichaContainer.innerHTML = `<div class="flex justify-center py-8"><div class="loading-spinner"></div></div>`;

    try {
        const res = await fetch(`${BASE_URL}/api/estudiantes/${hijoId}/ficha`, {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        const data = await res.json();
        if (data.success) {
            AppState.fichaCache[hijoId] = data.ficha;
            renderizarFicha(data.ficha);
        } else {
            if (fichaContainer) fichaContainer.innerHTML = `<p class="text-center text-gray-400 py-8">Sin datos de ficha disponibles.</p>`;
        }
    } catch (e) {
        console.error('Error cargando ficha:', e);
        if (fichaContainer) fichaContainer.innerHTML = `<p class="text-center text-red-400 py-8">Error al cargar la ficha.</p>`;
    }
}

function renderizarFicha(ficha) {
    const container = document.getElementById('ficha-container');
    if (!container) return;

    const bool = (v) => v ? '<span class="tag-si">Sí</span>' : '<span class="tag-no">No</span>';
    const fmt = (v) => v || '<span class="text-gray-300">—</span>';

    container.innerHTML = `
        <div class="ficha-grid fade-in">
            <!-- Datos del Niño -->
            <div class="ficha-seccion">
                <h4 class="ficha-titulo"><i class="ph-bold ph-user w-4 h-4"></i> Datos del Estudiante</h4>
                <div class="ficha-fila"><span class="ficha-label">Nombres</span><span class="ficha-valor">${fmt(ficha.nombres)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Apellidos</span><span class="ficha-valor">${fmt(ficha.apellidos)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">F. Nacimiento</span><span class="ficha-valor">${fmt(ficha.fecha_nacimiento)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Sexo</span><span class="ficha-valor">${ficha.sexo === 'M' ? '👦 Masculino' : ficha.sexo === 'F' ? '👧 Femenino' : '—'}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Cédula Escolar</span><span class="ficha-valor font-mono">${fmt(ficha.cedula_escolar)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Lugar Nacimiento</span><span class="ficha-valor">${fmt(ficha.lugar_nacimiento)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Dirección</span><span class="ficha-valor">${fmt(ficha.direccion_habitacion)}</span></div>
            </div>
            <!-- Datos Familiares -->
            <div class="ficha-seccion">
                <h4 class="ficha-titulo"><i class="ph-bold ph-users w-4 h-4"></i> Datos Familiares</h4>
                <div class="ficha-fila"><span class="ficha-label">Madre</span><span class="ficha-valor">${fmt(ficha.nombre_madre)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">C.I. Madre</span><span class="ficha-valor font-mono">${fmt(ficha.ci_madre)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Telf. Madre</span><span class="ficha-valor">${fmt(ficha.telefono_madre)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Ocupación Madre</span><span class="ficha-valor">${fmt(ficha.ocupacion_madre)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Padre</span><span class="ficha-valor">${fmt(ficha.nombre_padre)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Telf. Padre</span><span class="ficha-valor">${fmt(ficha.telefono_padre)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Tipo Vivienda</span><span class="ficha-valor">${fmt(ficha.tipo_vivienda)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Tenencia</span><span class="ficha-valor">${fmt(ficha.tenencia_vivienda)}</span></div>
            </div>
            <!-- Datos de Salud -->
            <div class="ficha-seccion">
                <h4 class="ficha-titulo"><i class="ph-bold ph-heartbeat w-4 h-4"></i> Salud y Hábitos</h4>
                <div class="ficha-fila"><span class="ficha-label">¿Cesárea?</span><span class="ficha-valor">${bool(ficha.fue_cesarea)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">¿Prematuro?</span><span class="ficha-valor">${bool(ficha.es_prematuro)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">¿Alérgico?</span><span class="ficha-valor">${bool(ficha.es_alergico)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Peso al nacer</span><span class="ficha-valor">${fmt(ficha.peso_nacer)} kg</span></div>
                <div class="ficha-fila"><span class="ficha-label">Talla al nacer</span><span class="ficha-valor">${fmt(ficha.talla_nacer)} cm</span></div>
                <div class="ficha-fila"><span class="ficha-label">Enf. crónica</span><span class="ficha-valor">${fmt(ficha.enfermedad_cronica)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Med. fiebre</span><span class="ficha-valor">${fmt(ficha.medicamento_fiebre)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Come solo</span><span class="ficha-valor">${fmt(ficha.come_solo)}</span></div>
                <div class="ficha-fila"><span class="ficha-label">Hora dormir</span><span class="ficha-valor">${fmt(ficha.hora_dormir)}</span></div>
            </div>
        </div>
    `;
}


// ============================================================
// 6. PROGRESO ACADÉMICO — Línea de tiempo por momentos
// ============================================================
async function cargarProgresoHijo(hijoId) {
    if (AppState.progresoCache[hijoId]) {
        renderizarProgreso(AppState.progresoCache[hijoId]);
        return;
    }

    const container = document.getElementById('progreso-container');
    if (container) container.innerHTML = `<div class="flex justify-center py-8"><div class="loading-spinner"></div></div>`;

    try {
        const res = await fetch(`${BASE_URL}/api/representante/hijos/${hijoId}/progreso`, {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        const data = await res.json();
        if (data.success) {
            AppState.progresoCache[hijoId] = data.progreso;
            renderizarProgreso(data.progreso);
        } else {
            if (container) container.innerHTML = `<p class="text-center text-gray-400 py-8">Aún no hay evaluaciones registradas.</p>`;
        }
    } catch (e) {
        console.error('Error cargando progreso:', e);
        if (container) container.innerHTML = `<p class="text-center text-red-400 py-8">Error al cargar el progreso.</p>`;
    }
}

function renderizarProgreso(progreso) {
    const container = document.getElementById('progreso-container');
    if (!container) return;

    if (!progreso || progreso.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="ph-bold ph-book-open w-8 h-8 text-gray-300"></i>
                </div>
                <p class="text-gray-400 text-sm">Aún no hay evaluaciones registradas para tu hijo(a).</p>
                <p class="text-gray-300 text-xs mt-1">El docente aún no ha publicado boletines.</p>
            </div>`;
        return;
    }

    const coloresArea = {
        'personal': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-400' },
        'ambiente': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-400' },
        'comunicación': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-400' },
    };

    const getColor = (area) => {
        if (!area) return coloresArea['personal'];
        const a = area.toLowerCase();
        if (a.includes('personal') || a.includes('social')) return coloresArea['personal'];
        if (a.includes('ambiente') || a.includes('entorno')) return coloresArea['ambiente'];
        return coloresArea['comunicación'];
    };

    const momentoLabel = { '1': '1.er Momento', '2': '2.do Momento', '3': '3.er Momento' };
    const momentoColor = {
        '1': { ring: 'ring-blue-400', bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50' },
        '2': { ring: 'ring-yellow-400', bg: 'bg-yellow-500', text: 'text-yellow-600', light: 'bg-yellow-50' },
        '3': { ring: 'ring-green-400', bg: 'bg-green-500', text: 'text-green-600', light: 'bg-green-50' },
    };

    container.innerHTML = `
        <div class="timeline-container">
            ${progreso.map((momento, idx) => {
                const mc = momentoColor[String(momento.momento)] || momentoColor['1'];
                const label = momentoLabel[String(momento.momento)] || `Momento ${momento.momento}`;

                // Agrupar indicadores por área
                const byArea = {};
                (momento.indicadores || []).forEach(ind => {
                    const area = ind.area || 'General';
                    if (!byArea[area]) byArea[area] = [];
                    byArea[area].push(ind.descripcion);
                });

                const totalLogrados = momento.indicadores?.length || 0;

                return `
                <div class="timeline-item fade-in" style="animation-delay: ${idx * 0.1}s">
                    <!-- Nodo de la línea de tiempo -->
                    <div class="timeline-node">
                        <div class="w-10 h-10 ${mc.bg} rounded-full ring-2 ${mc.ring} flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            ${momento.momento}
                        </div>
                        ${idx < progreso.length - 1 ? '<div class="timeline-line"></div>' : ''}
                    </div>

                    <!-- Contenido del momento -->
                    <div class="timeline-content">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-bold text-gray-800 text-base">${label}</h4>
                            <span class="badge-logrado">
                                <i class="ph-bold ph-check-circle w-3.5 h-3.5"></i>
                                ${totalLogrados} logrado${totalLogrados !== 1 ? 's' : ''}
                            </span>
                        </div>

                        ${totalLogrados === 0 ? `
                            <p class="text-xs text-gray-400 italic">Sin indicadores registrados en este momento.</p>
                        ` : Object.entries(byArea).map(([area, inds]) => {
                            const col = getColor(area);
                            return `
                            <div class="${col.bg} border ${col.border} rounded-xl p-3 mb-2">
                                <p class="text-xs font-bold ${col.text} mb-2 uppercase tracking-wide">${area}</p>
                                <ul class="space-y-1">
                                    ${inds.map(ind => `
                                        <li class="flex items-start gap-2 text-xs text-gray-600">
                                            <div class="w-1.5 h-1.5 ${col.dot} rounded-full mt-1.5 flex-shrink-0"></div>
                                            <span>${ind}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>`;
                        }).join('')}

                        ${momento.recomendacion ? `
                            <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <p class="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1">
                                    <i class="ph-bold ph-chat-circle w-3.5 h-3.5"></i>
                                    Recomendación Docente
                                </p>
                                <p class="text-xs text-amber-800 italic">"${momento.recomendacion}"</p>
                            </div>
                        ` : ''}

                        <!-- Botón descargar boletín -->
                        <button onclick="descargarBoletin(${AppState.hijoActivo?.id}, '${momento.momento}')"
                            class="mt-3 w-full py-2 flex items-center justify-center gap-2 text-xs font-semibold text-gray-600
                            <i class="ph-bold ph-download w-4 h-4"></i>
                            Descargar Boletín PDF
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}


// ============================================================
// 7. ASISTENCIA — Calendario visual de puntos
// ============================================================
async function cargarAsistenciaHijo(hijoId) {
    // Usamos el endpoint de asistencias del estudiante — buscamos por el mes actual
    const container = document.getElementById('asistencia-container');
    if (!container) return;

    if (AppState.asistenciaCache[hijoId]) {
        renderizarCalendarioAsistencia(AppState.asistenciaCache[hijoId]);
        return;
    }

    container.innerHTML = `<div class="flex justify-center py-6"><div class="loading-spinner"></div></div>`;

    // Usamos el endpoint seguro del backend que verifica pertenencia
    try {
        const hoy = new Date();
        const yearMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        const inicioMes = `${yearMonth}-01`;
        const finMes = `${yearMonth}-${String(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

        const res = await fetch(`${BASE_URL}/api/representante/hijos/${hijoId}/asistencias?fecha_inicio=${inicioMes}&fecha_fin=${finMes}`, {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });
        const data = await res.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Error al obtener asistencias');
        }
        
        const asistencias = data.asistencias || [];
        AppState.asistenciaCache[hijoId] = asistencias;
        renderizarCalendarioAsistencia(asistencias);
    } catch (e) {
        console.error('Error asistencia:', e);
        container.innerHTML = `<p class="text-center text-gray-400 py-4 text-sm">No se pudo cargar el historial de asistencia.</p>`;
    }
}

function renderizarCalendarioAsistencia(asistencias) {
    const container = document.getElementById('asistencia-container');
    if (!container) return;

    const asistMap = {};
    asistencias.forEach(a => { asistMap[a.fecha] = a.estado_asistencia; });

    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = hoy.getMonth();
    const primerDia = new Date(year, month, 1).getDay(); // 0=Dom
    const diasMes = new Date(year, month + 1, 0).getDate();

    const mesesES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

    let totalPresente = 0, totalAusente = 0;
    asistencias.forEach(a => {
        if (a.estado_asistencia === 'presente') totalPresente++;
        else totalAusente++;
    });

    let celdas = '';
    // Celdas vacías del inicio
    for (let i = 0; i < primerDia; i++) {
        celdas += `<div></div>`;
    }

    for (let d = 1; d <= diasMes; d++) {
        const fechaStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const estado = asistMap[fechaStr];
        const diaSemana = new Date(year, month, d).getDay();
        const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
        const esFuturo = new Date(year, month, d) > hoy;

        let claseColor = '';
        let dotColor = '';
        if (esFinDeSemana) {
            claseColor = 'cal-dia-finde';
        } else if (esFuturo) {
            claseColor = 'cal-dia-futuro';
        } else if (estado === 'presente') {
            claseColor = 'cal-dia-presente';
            dotColor = 'dot-verde';
        } else if (estado === 'ausente') {
            claseColor = 'cal-dia-ausente';
            dotColor = 'dot-rojo';
        } else {
            claseColor = 'cal-dia-sin-datos';
        }

        celdas += `
            <div class="cal-dia ${claseColor}" title="${fechaStr}">
                <span>${d}</span>
                ${dotColor ? `<div class="${dotColor}"></div>` : ''}
            </div>`;
    }

    container.innerHTML = `
        <div class="fade-in">
            <!-- Leyenda Resumen -->
            <div class="flex items-center gap-4 mb-4 text-sm">
                <div class="flex items-center gap-1.5">
                    <div class="dot-verde"></div>
                    <span class="text-gray-600">Presentes: <strong class="text-green-600">${totalPresente}</strong></span>
                </div>
                <div class="flex items-center gap-1.5">
                    <div class="dot-rojo"></div>
                    <span class="text-gray-600">Ausencias: <strong class="text-red-500">${totalAusente}</strong></span>
                </div>
            </div>
            <!-- Calendario -->
            <h4 class="text-sm font-bold text-gray-700 mb-3">${mesesES[month]} ${year}</h4>
            <div class="cal-grid-semana">
                ${diasSemana.map(d => `<div class="cal-header-dia">${d}</div>`).join('')}
            </div>
            <div class="cal-grid">
                ${celdas}
            </div>
        </div>
    `;
}


// ============================================================
// 8. DESCARGAR DOCUMENTOS (Constancias + Boletines)
// ============================================================
function descargarDocumento(tipo) {
    const hijo = AppState.hijoActivo;
    if (!hijo) {
        Swal.fire({ icon: 'warning', title: 'Sin hijo seleccionado', text: 'Selecciona primero el perfil del estudiante.', confirmButtonColor: '#EC4899' });
        return;
    }

    Swal.fire({
        title: `Generando Constancia de ${tipo === 'estudio' ? 'Estudio' : 'Inscripción'}...`,
        text: 'Preparando el documento Word oficial',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const url = `${BASE_URL}/api/estudiantes/${hijo.id}/constancia/${tipo}?token=${AppState.token}`;

    setTimeout(() => {
        Swal.close();
        window.open(url, '_blank');
    }, 1000);
}

function descargarBoletin(hijoId, momento) {
    if (!hijoId) return;

    Swal.fire({
        title: `Generando Boletín — Momento ${momento}...`,
        text: 'Preparando diseño PDF Premium',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const url = `${BASE_URL}/api/boletines/descargar/${hijoId}/${momento}?token=${AppState.token}`;

    setTimeout(() => {
        Swal.close();
        window.open(url, '_blank');
    }, 1000);
}


// ============================================================
// 9. COMUNICADOS — Tablón de anuncios desde Supabase
// ============================================================
async function cargarComunicados() {
    const container = document.getElementById('comunicados-container');
    if (!container) return;

    try {
        // Usamos el endpoint del backend Flask
        const res = await fetch(`${BASE_URL}/api/comunicados`, {
            headers: { 'Authorization': `Bearer ${AppState.token}` }
        });

        const data = await res.json();
        if (data.success) {
            AppState.comunicados = data.comunicados || [];
            renderizarComunicados(AppState.comunicados);
        } else {
            renderizarComunicados([]);
        }
    } catch (e) {
        console.warn('Sin comunicados disponibles:', e.message);
        renderizarComunicados([]);
    }
}

function renderizarComunicados(comunicados) {
    const container = document.getElementById('comunicados-container');
    if (!container) return;

    if (!comunicados || comunicados.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <i class="ph-bold ph-megaphone w-6 h-6 text-gray-300"></i>
                </div>
                <p class="text-gray-400 text-sm">No hay comunicados recientes.</p>
            </div>`;
        return;
    }

    const prioridadColor = {
        'urgente': { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' },
        'importante': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
        'informativo': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400', border: 'border-blue-200' },
    };

    container.innerHTML = comunicados.map(com => {
        const prioridad = com.prioridad || 'informativo';
        const col = prioridadColor[prioridad] || prioridadColor['informativo'];
        const fecha = com.created_at ? new Date(com.created_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }) : '';

        return `
            <div class="comunicado-card border ${col.border} fade-in">
                <div class="flex items-start gap-3">
                    <div class="w-2.5 h-2.5 ${col.dot} rounded-full flex-shrink-0 mt-1.5"></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <h5 class="font-semibold text-gray-800 text-sm truncate">${com.titulo || 'Sin título'}</h5>
                            <span class="text-xs text-gray-400 flex-shrink-0">${fecha}</span>
                        </div>
                        <p class="text-xs text-gray-600 leading-relaxed">${com.contenido || ''}</p>
                        ${prioridad === 'urgente' ? `
                            <span class="inline-block mt-2 text-xs font-bold ${col.text} ${col.bg} px-2 py-0.5 rounded-full">
                                ⚠️ Urgente
                            </span>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('');
}


// ============================================================
// 10. ACTUALIZAR DATOS PERSONALES DEL REPRESENTANTE
// ============================================================
async function guardarDatosPersonales(e) {
    e.preventDefault();

    const hijo = AppState.hijoActivo;
    if (!hijo) {
        Swal.fire({ icon: 'warning', title: 'Selecciona un hijo primero', confirmButtonColor: '#EC4899' });
        return;
    }

    const telefono_madre = document.getElementById('perfil-telefono-madre')?.value.trim();
    const telefono_padre = document.getElementById('perfil-telefono-padre')?.value.trim();
    const direccion = document.getElementById('perfil-direccion')?.value.trim();

    const btn = document.getElementById('btn-guardar-perfil');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner-sm"></span> Guardando...';

    try {
        // Usamos el endpoint dedicado al representante (incluye validación de hijo_id)
        const payload = {
            hijo_id: hijo.id,
            telefono_madre,
            telefono_padre,
            direccion_habitacion: direccion
        };

        const res = await fetch(`${BASE_URL}/api/representante/perfil`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${AppState.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            // Invalidar cache de ficha para recargar con datos frescos
            delete AppState.fichaCache[hijo.id];
            Swal.fire({
                toast: true, position: 'top-end', icon: 'success',
                title: '¡Datos actualizados!', showConfirmButton: false, timer: 2500
            });
        } else {
            Swal.fire({ icon: 'error', title: 'Error', text: data.message, confirmButtonColor: '#EC4899' });
        }
    } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error de red', text: 'Verifica tu conexión.', confirmButtonColor: '#EC4899' });
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}


// ============================================================
// 11. NAVEGACIÓN POR SECCIONES (SPA simple)
// ============================================================
function navegarA(seccionId) {
    // Ocultar todas las secciones
    document.querySelectorAll('.seccion-panel').forEach(s => {
        s.classList.remove('active-panel');
        s.classList.add('hidden');
    });

    // Mostrar la sección activa
    const panel = document.getElementById(`panel-${seccionId}`);
    if (panel) {
        panel.classList.remove('hidden');
        requestAnimationFrame(() => panel.classList.add('active-panel'));
    }

    // Actualizar nav-links activos
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('nav-link-active');
    });
    const linkActivo = document.querySelector(`[data-seccion="${seccionId}"]`);
    if (linkActivo) linkActivo.classList.add('nav-link-active');

    // Cerrar sidebar en móvil
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 768) {
        toggleSidebar(false);
    }

    // Cargar datos específicos de la sección si hay hijo activo
    if (AppState.hijoActivo) {
        if (seccionId === 'ficha') cargarFichaHijo(AppState.hijoActivo.id);
        if (seccionId === 'progreso') cargarProgresoHijo(AppState.hijoActivo.id);
        if (seccionId === 'asistencia') cargarAsistenciaHijo(AppState.hijoActivo.id);
        if (seccionId === 'perfil') rellenarFormularioPerfil();
    }
}

function rellenarFormularioPerfil() {
    const hijo = AppState.hijoActivo;
    if (!hijo) return;

    const ficha = AppState.fichaCache[hijo.id];
    if (ficha) {
        const tel_m = document.getElementById('perfil-telefono-madre');
        const tel_p = document.getElementById('perfil-telefono-padre');
        const dir = document.getElementById('perfil-direccion');
        if (tel_m) tel_m.value = ficha.telefono_madre || '';
        if (tel_p) tel_p.value = ficha.telefono_padre || '';
        if (dir) dir.value = ficha.direccion_habitacion || '';
    }
}


// ============================================================
// 12. HELPERS — Menú lateral y logout
// ============================================================
let _sidebarOpen = false;

function toggleSidebar(forzar = null) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (!sidebar || !overlay) return;

    _sidebarOpen = forzar !== null ? forzar : !_sidebarOpen;

    if (_sidebarOpen) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

function logout() {
    Swal.fire({
        title: '¿Cerrar Sesión?',
        text: 'Saldrás del portal familiar.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EC4899',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Sí, salir',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_rol');
            localStorage.removeItem('user_email');
            window.location.replace('login.html');
        }
    });
}


// ============================================================
// 13. INICIALIZAR AL CARGAR EL DOM
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar iconos Lucide
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Formulario de datos personales
    const formPerfil = document.getElementById('form-datos-personales');
    if (formPerfil) formPerfil.addEventListener('submit', guardarDatosPersonales);

    // Iniciar la app
    initApp().then(() => {
        // Navegar a inicio por defecto
        navegarA('inicio');
    });
});
