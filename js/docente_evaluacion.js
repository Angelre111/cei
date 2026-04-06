// ============================================
// LÓGICA DEL PANEL MAESTRO DE EVALUACIONES
// ============================================

let masterIndicators = {};
let currentEvalData = { logrados: [] };

document.addEventListener('DOMContentLoaded', () => {
    const selMomento = document.getElementById('eval-momento-select');
    const selEstudiante = document.getElementById('eval-estudiante-select');
    const btnGuardar = document.getElementById('btn-guardar-evaluacion');
    
    const btnWord = document.querySelector('#eval-download-buttons button:nth-child(1)');
    const btnPDF = document.querySelector('#eval-download-buttons button:nth-child(2)');

    if (selMomento) {
        selMomento.addEventListener('change', async (e) => {
            const momento = e.target.value;
            if (momento) {
                await fetchMasterIndicators(momento);
                habilitarEstudiantes();
                limpiarPanel();
            }
        });
    }

    if (selEstudiante) {
        selEstudiante.addEventListener('change', async (e) => {
            const hijoId = e.target.value;
            const momento = selMomento.value;
            if (hijoId && momento) {
                await fetchEvaluacionEstudiante(hijoId, momento);
            } else {
                limpiarPanel();
            }
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarEvaluacion);
    }
    
    if (btnWord) {
        btnWord.addEventListener('click', descargarBoletinWord);
    }
    
    if (btnPDF) {
        btnPDF.addEventListener('click', () => {
            Swal.fire({
                icon: 'info',
                title: 'PDF en camino',
                text: 'La descarga directa en PDF estará disponible próximamente.',
                customClass: { popup: 'rounded-3xl' }
            });
        });
    }
});

function habilitarEstudiantes() {
    const selEstudiante = document.getElementById('eval-estudiante-select');
    selEstudiante.disabled = false;
    if (selEstudiante.options.length > 0) {
        selEstudiante.options[0].text = "Seleccione un estudiante...";
    }
}

function limpiarPanel() {
    document.getElementById('eval-empty-state').classList.remove('hidden');
    document.getElementById('eval-col-formacion').innerHTML = '';
    document.getElementById('eval-col-ambiente').innerHTML = '';
    document.getElementById('eval-col-comunicacion').innerHTML = '';
    document.getElementById('eval-recomendacion').value = '';
    document.getElementById('eval-download-buttons').classList.add('hidden');
    document.getElementById('btn-guardar-evaluacion').disabled = true;
    
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
            console.error("Error indicadores maestro:", data.message);
            masterIndicators = {};
        }
    } catch(e) {
        console.error(e);
        masterIndicators = {};
    }
}

async function fetchEvaluacionEstudiante(hijoId, momento) {
    document.getElementById('eval-empty-state').classList.add('hidden');
    document.getElementById('btn-guardar-evaluacion').disabled = false;
    document.getElementById('btn-guardar-evaluacion').innerHTML = '<i class="ph-spinner animate-spin text-xl"></i> Cargando...';
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const res = await fetch(`${baseUrl}/api/evaluacion/${hijoId}/${momento}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            currentEvalData = data.data || { logrados: [] };
            renderizarPanel();
        } else {
            currentEvalData = { logrados: [] };
            renderizarPanel();
        }
    } catch(e) {
        console.error(e);
        currentEvalData = { logrados: [] };
        renderizarPanel();
    } finally {
        document.getElementById('btn-guardar-evaluacion').innerHTML = '<i class="ph-bold ph-floppy-disk text-xl"></i> Guardar Evaluación';
    }
}

function renderizarPanel() {
    // Si tiene boleta, mostrar btn descargar
    if (currentEvalData.boleta_id) {
        document.getElementById('eval-download-buttons').classList.remove('hidden');
    } else {
        document.getElementById('eval-download-buttons').classList.add('hidden');
    }

    document.getElementById('eval-recomendacion').value = currentEvalData.recomendacion_docente || '';
    
    renderizarArea('Formación Personal y Social', 'eval-col-formacion');
    renderizarArea('Relación entre los Componentes del Ambiente', 'eval-col-ambiente');
    renderizarArea('Comunicación y Representación', 'eval-col-comunicacion');
}

function renderizarArea(nombreArea, colId) {
    const container = document.getElementById(colId);
    let lista = [];
    
    for (let key in masterIndicators) {
        if (key.includes("Personal") && nombreArea.includes("Personal")) lista = masterIndicators[key];
        else if (key.includes("Ambiente") && nombreArea.includes("Ambiente")) lista = masterIndicators[key];
        else if (key.includes("Comunicación") && nombreArea.includes("Comunicación")) lista = masterIndicators[key];
    }
    
    if (!lista || lista.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-400 p-4 text-center border-2 border-dashed rounded-xl border-gray-100 flex flex-col items-center gap-2"><i class="ph-duotone ph-list-dashes text-2xl text-gray-300"></i> Sin indicadores cargados en este momento</p>`;
        return;
    }
    
    let html = '';
    lista.forEach(ind => {
        const isLogrado = currentEvalData.logrados.includes(ind.id);
        
        html += `
        <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2 eval-indicator-card group" data-id="${ind.id}">
            <p class="text-[12px] font-medium text-gray-700 leading-snug">${ind.descripcion}</p>
            <div class="flex items-center gap-2 mt-1">
                <select class="indicator-select w-full px-2 py-1.5 border rounded-lg text-[11px] font-bold outline-none border-gray-200 transition-colors cursor-pointer appearance-none ${isLogrado ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500'}">
                    <option value="" ${!isLogrado ? 'selected' : ''}>⏳ Pendiente / En Proceso</option>
                    <option value="L" ${isLogrado ? 'selected' : ''}>✅ Logrado</option>
                </select>
            </div>
            <div class="text-[9px] text-gray-400 font-bold uppercase truncate mt-0.5" title="${ind.proyecto_nombre}"><i class="ph-fill ph-book-open text-gray-300"></i> ${ind.proyecto_nombre}</div>
        </div>
        `;
    });
    
    container.innerHTML = html;
    
    container.querySelectorAll('.indicator-select').forEach(sel => {
        sel.addEventListener('change', function() {
            if(this.value === 'L') {
                this.classList.replace('bg-gray-50', 'bg-green-50');
                this.classList.replace('text-gray-500', 'text-green-700');
                this.classList.replace('border-gray-200', 'border-green-200');
            } else {
                this.classList.replace('bg-green-50', 'bg-gray-50');
                this.classList.replace('text-green-700', 'text-gray-500');
                this.classList.replace('border-green-200', 'border-gray-200');
            }
        });
    });
}

async function guardarEvaluacion() {
    const hijoId = document.getElementById('eval-estudiante-select').value;
    const momento = document.getElementById('eval-momento-select').value;
    const recomendacion = document.getElementById('eval-recomendacion').value.trim();
    const btnGuardar = document.getElementById('btn-guardar-evaluacion');
    
    const logrados = [];
    document.querySelectorAll('.eval-indicator-card').forEach(card => {
        const id = card.getAttribute('data-id');
        const select = card.querySelector('.indicator-select');
        if(select && select.value === 'L') {
            logrados.push(id);
        }
    });
    
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
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Boleta Guardada', showConfirmButton: false, timer: 2000 });
            document.getElementById('eval-download-buttons').classList.remove('hidden');
            // Update local memory to not lose context immediately 
            currentEvalData.boleta_id = data.data.boleta_id;
            currentEvalData.recomendacion_docente = recomendacion;
            currentEvalData.logrados = logrados;
        } else {
            Swal.fire('Error', data.message || 'No se pudo guardar.', 'error');
        }
    } catch(e) {
        console.error(e);
        Swal.fire('Error', 'Falla de conexión al guardar.', 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '<i class="ph-bold ph-floppy-disk text-xl"></i> Guardar Evaluación';
    }
}

function descargarBoletinWord() {
    const hijoId = document.getElementById('eval-estudiante-select').value;
    const momento = document.getElementById('eval-momento-select').value;
    
    if (!hijoId || !momento) return;
    
    Swal.fire({
        title: 'Generando Boletín...',
        text: 'Preparando el documento Word oficial',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });
    
    const token = localStorage.getItem('auth_token');
    const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
    
    // Direct link with token to force download in browser
    const url = `${baseUrl}/api/boletines/descargar/${hijoId}/${momento}?token=${token}`;
    
    // Small delay to allow the loading spinner to be seen
    setTimeout(() => {
        Swal.close();
        window.open(url, '_blank');
    }, 1000);
}
