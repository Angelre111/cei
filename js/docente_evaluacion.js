// ============================================
// LÓGICA DEL PANEL MAESTRO DE EVALUACIONES (PREMIUM)
// ============================================

let masterIndicators = {};
let currentEvalData = { logrados: [] };

document.addEventListener('DOMContentLoaded', () => {
    // Nuevos IDs del HTML SaaS
    const selMomento = document.getElementById('eval-momento');
    const selEstudiante = document.getElementById('eval-estudiante');
    const btnCargar = document.getElementById('btn-cargar-evaluacion');
    const btnGuardar = document.getElementById('btn-guardar-evaluacion');
    const btnDescargar = document.getElementById('btn-descargar-boletin');
    
    const selBanco = document.getElementById('eval-banco-select');
    const btnInsertarFrase = document.getElementById('btn-insertar-frase');

    // Al cambiar el momento, recargamos indicadores maestros
    if (selMomento) {
        selMomento.addEventListener('change', async (e) => {
            const momento = e.target.value;
            if (momento) {
                await fetchMasterIndicators(momento);
            }
        });
    }

    // El botón Cargar Datos es el disparador principal ahora
    if (btnCargar) {
        btnCargar.addEventListener('click', async () => {
            const hijoId = selEstudiante.value;
            const momento = selMomento.value;
            
            if (!hijoId || !momento) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Selección Incompleta',
                    text: 'Por favor seleccione un estudiante y un momento pedagógico.',
                    customClass: { popup: 'rounded-3xl' }
                });
                return;
            }

            // Fix: Asegurar que los indicadores maestros estén cargados antes de renderizar
            await fetchMasterIndicators(momento);
            await fetchEvaluacionEstudiante(hijoId, momento);
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarEvaluacion);
    }
    
    if (btnDescargar) {
        btnDescargar.addEventListener('click', descargarBoletinPDF);
    }

    if (btnInsertarFrase && selBanco) {
        btnInsertarFrase.addEventListener('click', () => {
            const frase = selBanco.value;
            if (frase) {
                const textarea = document.getElementById('eval-recomendacion');
                const currentText = textarea.value;
                textarea.value = currentText + (currentText ? ' ' : '') + frase;
                selBanco.value = ''; // Reset select
            }
        });
    }

    const btnNuevoInd = document.getElementById('btn-nuevo-indicador-individual');
    if (btnNuevoInd) {
        btnNuevoInd.addEventListener('click', abrirModalIndicadorIndividual);
    }

    // El banco de frases ahora se gestiona dinámicamente desde js/docente_recomendaciones.js
});




function limpiarPanel() {
    document.getElementById('eval-empty-state').classList.remove('hidden');
    document.getElementById('eval-empty-state').classList.add('flex');
    document.getElementById('eval-content-area').classList.add('hidden');
    document.getElementById('eval-content-area').classList.remove('flex');
    
    const container = document.getElementById('eval-indicadores-container');
    if (container) container.innerHTML = '';
    
    document.getElementById('eval-recomendacion').value = '';
    document.getElementById('btn-descargar-boletin').classList.add('hidden');
    
    currentEvalData = { logrados: [] };
}

async function fetchMasterIndicators(momento) {
    const seccionId = localStorage.getItem('seccion_activa_id');
    if (!seccionId) return;
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const res = await fetch(`${baseUrl}/api/evaluacion/indicadores/${seccionId}/${momento}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            masterIndicators = data.data || {};
        } else {
            masterIndicators = {};
        }
    } catch(e) {
        console.error(e);
        masterIndicators = {};
    }
}

async function fetchEvaluacionEstudiante(hijoId, momento) {
    const btnCargar = document.getElementById('btn-cargar-evaluacion');
    const originalHTML = btnCargar.innerHTML;
    btnCargar.disabled = true;
    btnCargar.innerHTML = '<i class="ph-spinner animate-spin"></i> Cargando...';
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const res = await fetch(`${baseUrl}/api/evaluacion/${hijoId}/${momento}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        
        // Transición de áreas
        document.getElementById('eval-empty-state').classList.add('hidden');
        document.getElementById('eval-empty-state').classList.remove('flex');
        document.getElementById('eval-content-area').classList.remove('hidden');
        document.getElementById('eval-content-area').classList.add('flex');

        if (res.ok && data.success) {
            currentEvalData = data.data || { logrados: [] };

            // Integrar indicadores individuales en masterIndicators
            const indivs = currentEvalData.indicadores_individuales || [];
            indivs.forEach(ind => {
                const area = ind.area_aprendizaje;
                if (!masterIndicators[area]) {
                    masterIndicators[area] = [];
                }
                if (!masterIndicators[area].some(existing => existing.id === ind.id)) {
                    masterIndicators[area].push({
                        id: ind.id,
                        proyecto_id: null,
                        proyecto_nombre: 'Indicador Individual',
                        descripcion: ind.descripcion
                    });
                }
            });
        } else {
            currentEvalData = { logrados: [] };
        }
        
        renderizarPanelPremium();
        
    } catch(e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error');
    } finally {
        btnCargar.disabled = false;
        btnCargar.innerHTML = originalHTML;
    }
}

function renderizarPanelPremium() {
    // Si tiene boleta, mostrar btn descargar
    if (currentEvalData.boleta_id || currentEvalData.boletin_id) {
        document.getElementById('btn-descargar-boletin').classList.remove('hidden');
    } else {
        document.getElementById('btn-descargar-boletin').classList.add('hidden');
    }

    document.getElementById('eval-recomendacion').value = currentEvalData.recomendacion_docente || '';
    
    // Llamamos a la función premium inyectada
    renderizarIndicadoresPremium(masterIndicators, currentEvalData.logrados || []);
}

/**
 * Función inyectada por el usuario con diseño SaaS/Premium
 */
function renderizarIndicadoresPremium(agrupados, logrados) {
    const container = document.getElementById('eval-indicadores-container');
    container.innerHTML = '';

    // Si no hay indicadores
    if (Object.keys(agrupados).length === 0) {
        container.innerHTML = `<div class="p-8 bg-slate-50 rounded-2xl text-center text-slate-500 border border-slate-100">No hay indicadores registrados para este momento.</div>`;
        return;
    }

    // Iterar por cada área de aprendizaje
    for (const [area, indicadores] of Object.entries(agrupados)) {
        // 1. Crear Tarjeta (Card) por Área
        const areaCard = document.createElement('div');
        areaCard.className = 'bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-[0_2px_10px_rgb(0,0,0,0.02)]';

        // Determinar icono sutil según el nombre del área
        let iconClass = 'ph-brain';
        if(area.toLowerCase().includes('personal')) iconClass = 'ph-user-focus';
        if(area.toLowerCase().includes('ambiente')) iconClass = 'ph-leaf';
        if(area.toLowerCase().includes('comunicaci')) iconClass = 'ph-chats-teardrop';

        // 2. Cabecera del Área
        const areaHeader = document.createElement('div');
        areaHeader.className = 'bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center gap-3';
        areaHeader.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <i class="ph-fill ${iconClass} text-lg"></i>
            </div>
            <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest">${area}</h4>
        `;
        areaCard.appendChild(areaHeader);

        // 3. Lista de Indicadores interactiva
        const listDiv = document.createElement('div');
        listDiv.className = 'flex flex-col divide-y divide-slate-100';

        indicadores.forEach(ind => {
            // Verificar si este indicador está en el array de 'logrados'
            const isChecked = logrados.includes(ind.id) ? 'checked' : '';
            
            const itemLabel = document.createElement('label');
            itemLabel.className = 'group relative flex items-start gap-4 p-5 hover:bg-emerald-50/50 cursor-pointer transition-colors';

            
            // Usamos "peer" de Tailwind para animar el custom checkbox basado en el input invisible
            itemLabel.innerHTML = `
                <div class="relative flex items-center shrink-0 pt-0.5">
                    <input type="checkbox" class="eval-checkbox peer sr-only" value="${ind.id}" ${isChecked}>
                    
                    <div class="w-6 h-6 rounded-full border-2 border-slate-300 bg-white peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center shadow-sm">
                        <i class="ph-bold ph-check text-white opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all duration-200"></i>
                    </div>
                </div>
                
                <div class="flex-1">
                    <p class="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors leading-relaxed">${ind.descripcion}</p>
                    ${ind.proyecto_nombre ? `<span class="inline-block mt-2 px-2.5 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide rounded-md border border-slate-200"><i class="ph-bold ph-folder text-slate-400 mr-1"></i>${ind.proyecto_nombre}</span>` : ''}
                </div>
            `;
            listDiv.appendChild(itemLabel);
        });

        areaCard.appendChild(listDiv);
        container.appendChild(areaCard);
    }
}

async function guardarEvaluacion() {
    const hijoId = document.getElementById('eval-estudiante').value;
    const momento = document.getElementById('eval-momento').value;
    const recomendacion = document.getElementById('eval-recomendacion').value.trim();
    const btnGuardar = document.getElementById('btn-guardar-evaluacion');
    
    // Obtener indicadores marcados
    const logrados = [];
    document.querySelectorAll('.eval-checkbox:checked').forEach(input => {
        logrados.push(input.value);
    });
    
    if (!hijoId || !momento) return;

    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="ph-spinner animate-spin text-xl"></i> Guardando...';
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const payload = {
            hijo_id: hijoId,
            momento: momento,
            recomendacion: recomendacion,
            logrados: logrados
        };
        
        const res = await fetch(`${baseUrl}/api/evaluacion`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            Swal.fire({ 
                toast: true, 
                position: 'top-end', 
                icon: 'success', 
                title: 'Evaluación Guardada Correctamente', 
                showConfirmButton: false, 
                timer: 2500 
            });
            document.getElementById('btn-descargar-boletin').classList.remove('hidden');
            
            // Actualizar memoria local
            currentEvalData.boleta_id = data.data?.boleta_id || true;
            currentEvalData.recomendacion_docente = recomendacion;
            currentEvalData.logrados = logrados;
        } else {
            Swal.fire('Error', data.message || 'No se pudo guardar la evaluación.', 'error');
        }
    } catch(e) {
        console.error(e);
        Swal.fire('Error', 'Falla de conexión al guardar.', 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '<i class="ph-bold ph-floppy-disk text-xl"></i> Guardar Evaluación';
    }
}

function descargarBoletinPDF() {
    const hijoId = document.getElementById('eval-estudiante').value;
    const momento = document.getElementById('eval-momento').value;
    
    if (!hijoId || !momento) return;
    
    Swal.fire({
        title: 'Generando Boletín...',
        text: 'Preparando el documento PDF Premium oficial',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });
    
    const token = localStorage.getItem('auth_token');
    const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
    
    // Enlace directo con token
    const url = `${baseUrl}/api/boletines/descargar/${hijoId}/${momento}?token=${token}`;
    
    setTimeout(() => {
        Swal.close();
        window.open(url, '_blank');
    }, 1000);
}

async function abrirModalIndicadorIndividual() {
    const hijoId = document.getElementById('eval-estudiante').value;
    const momento = document.getElementById('eval-momento').value;

    if (!hijoId || !momento) {
        Swal.fire({
            icon: 'warning',
            title: 'Selección Incompleta',
            text: 'Por favor seleccione un estudiante y un momento pedagógico primero.',
            customClass: { popup: 'rounded-3xl' }
        });
        return;
    }

    Swal.fire({
        title: 'Agregar Indicador Individual',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Área de Aprendizaje</label>
                    <select id="swal-indicador-area" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                        <option value="Formación Personal y Social">Formación Personal y Social</option>
                        <option value="Relación entre los Componentes del Ambiente">Relación con el Ambiente</option>
                        <option value="Comunicación y Representación">Comunicación y Representación</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Descripción del Indicador</label>
                    <textarea id="swal-indicador-desc" rows="3" placeholder="Ej: Demuestra independencia al realizar tareas sencillas..." class="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none"></textarea>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
            const area = document.getElementById('swal-indicador-area').value;
            const desc = document.getElementById('swal-indicador-desc').value.trim();
            if (!desc) {
                Swal.showValidationMessage('La descripción del indicador es requerida.');
                return false;
            }
            return { area_aprendizaje: area, descripcion: desc };
        },
        customClass: { popup: 'rounded-3xl' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const { area_aprendizaje, descripcion } = result.value;

            try {
                const token = localStorage.getItem('auth_token');
                const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';

                Swal.fire({ title: 'Creando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                const res = await fetch(`${baseUrl}/api/evaluacion/indicador-individual`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        hijo_id: hijoId,
                        momento: momento,
                        area_aprendizaje: area_aprendizaje,
                        descripcion: descripcion
                    })
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'Indicador individual añadido',
                        showConfirmButton: false,
                        timer: 2000
                    });

                    const nuevoInd = data.data;

                    // Añadir a masterIndicators localmente
                    const area = nuevoInd.area_aprendizaje;
                    if (!masterIndicators[area]) {
                        masterIndicators[area] = [];
                    }
                    masterIndicators[area].push({
                        id: nuevoInd.id,
                        proyecto_id: null,
                        proyecto_nombre: 'Indicador Individual',
                        descripcion: nuevoInd.descripcion
                    });

                    // Añadir a los marcados como logrados
                    if (!currentEvalData.logrados) {
                        currentEvalData.logrados = [];
                    }
                    currentEvalData.logrados.push(nuevoInd.id);

                    // Re-renderizar el panel
                    renderizarPanelPremium();

                } else {
                    Swal.fire('Error', data.message || 'No se pudo crear el indicador.', 'error');
                }
            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Problema de conexión con el servidor.', 'error');
            }
        }
    });
}
