// ============================================
// LÓGICA DE INDICADORES (POR PROYECTO)
// ============================================

let indicadoresCargadas = [];

document.addEventListener('DOMContentLoaded', () => {
    const btnGuardarInd = document.getElementById('btn-guardar-indicador');
    if (btnGuardarInd) {
        btnGuardarInd.addEventListener('click', crearIndicador);
    }

    const btnActualizarInd = document.getElementById('btn-actualizar-indicador');
    if(btnActualizarInd) {
        btnActualizarInd.addEventListener('click', actualizarIndicador);
    }
});

// Llamada desde docente_proyectos.js cuando se selecciona un proyecto
window.cargarIndicadoresDeProyecto = async function(proyectoId, estadoProyecto) {
    const container = document.getElementById('lista-indicadores-areas');
    
    if (!proyectoId || !container) return;

    // Si el proyecto está cerrado, bloqueamos agregar
    const formAgregar = document.getElementById('form-agregar-indicador');
    if (estadoProyecto === 'cerrado') {
        if(formAgregar) formAgregar.classList.add('hidden');
    } else {
        if(formAgregar) formAgregar.classList.remove('hidden');
    }

    container.innerHTML = `<div class="text-center py-10"><i class="ph-spinner animate-spin text-3xl text-purple-300"></i></div>`;
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const res = await fetch(`${baseUrl}/api/indicadores/${proyectoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            indicadoresCargadas = data.data || [];
            renderizarIndicadores(estadoProyecto);
        } else {
            container.innerHTML = `<div class="text-sm text-red-500 text-center py-4">${data.message || 'Error'}</div>`;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="text-sm text-red-500 text-center py-4">Error de conexión</div>`;
    }
}

window.abrirModalVerProyecto = function() {
    const modal = document.getElementById('modal-ver-proyecto');
    const content = document.getElementById('modal-ver-proyecto-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-100'); // Note: previously scale-95
        content.classList.remove('scale-95');
    }, 10);
}

window.cerrarModalVerProyecto = function() {
    const modal = document.getElementById('modal-ver-proyecto');
    const content = document.getElementById('modal-ver-proyecto-content');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function renderizarIndicadores(estadoProyecto) {
    // 1. Renderizado para el panel lateral (clásico - OPCIONAL mantenerlo)
    const containerPanel = document.getElementById('lista-indicadores-areas');
    
    // 2. Renderizado para el Modal Premium (Nuevo)
    const containerModal = document.getElementById('proyecto-indicadores-lista');
    const conteoBadge = document.getElementById('proyecto-detalle-conteo');
    
    if (conteoBadge) conteoBadge.innerText = `${indicadoresCargadas.length} Indicadores`;

    if (indicadoresCargadas.length === 0) {
        const emptyHTML = `
            <div class="col-span-full text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <i class="ph-duotone ph-list-checks text-4xl text-slate-300 mb-2"></i>
                <p class="text-sm font-bold text-slate-500">Este proyecto no tiene indicadores.</p>
            </div>`;
        if (containerModal) containerModal.innerHTML = emptyHTML;
        return;
    }

    let htmlModal = '';
    indicadoresCargadas.forEach(ind => {
        // Definir color según el área
        let colorBadge = 'bg-slate-100 text-slate-600';
        const area = ind.area_aprendizaje.toLowerCase();
        if(area.includes('personal')) colorBadge = 'bg-blue-50 text-blue-600 border border-blue-100';
        else if(area.includes('ambiente')) colorBadge = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
        else if(area.includes('comunicaci')) colorBadge = 'bg-purple-50 text-purple-600 border border-purple-100';

        const botonesAccion = estadoProyecto === 'activo' ? `
            <div class="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="abrirModalEditarIndicador('${ind.id}')" class="text-slate-300 hover:text-yellow-500" title="Editar Indicador">
                    <i class="ph-fill ph-pencil-simple text-lg"></i>
                </button>
                <button onclick="eliminarIndicador('${ind.id}')" class="text-slate-300 hover:text-red-500" title="Eliminar Indicador">
                    <i class="ph-fill ph-trash text-lg"></i>
                </button>
            </div>
        ` : '';

        htmlModal += `
            <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow relative group animate-fade-in">
                <span class="inline-block px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider mb-2 ${colorBadge}">
                    ${ind.area_aprendizaje}
                </span>
                <p class="text-sm font-medium text-slate-700 leading-snug pr-12">${ind.descripcion}</p>
                ${botonesAccion}
            </div>
        `;
    });

    if (containerModal) containerModal.innerHTML = htmlModal;
}

async function crearIndicador() {
    if (!proyectoSeleccionadoId) {
        Swal.fire('Error', 'Selecciona un proyecto primero.', 'error');
        return;
    }
    
    const inputArea = document.getElementById('nuevo-indicador-area');
    const inputTexto = document.getElementById('nuevo-indicador-texto');
    const btnGuardarInd = document.getElementById('btn-guardar-indicador');
    
    const area = inputArea.value;
    const texto = inputTexto.value.trim();
    
    if (!area) {
        Swal.fire('Atención', 'Seleccione el Área de Aprendizaje.', 'warning');
        return;
    }
    if (!texto) {
        Swal.fire('Atención', 'Escriba la descripción del indicador.', 'warning');
        return;
    }
    
    btnGuardarInd.disabled = true;
    btnGuardarInd.innerHTML = '<i class="ph-spinner animate-spin"></i>';
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const payload = { proyecto_id: proyectoSeleccionadoId, area_aprendizaje: area, descripcion: texto };
        
        const res = await fetch(`${baseUrl}/api/indicadores`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            inputTexto.value = '';
            // Recargar para el proyecto actual
            cargarIndicadoresDeProyecto(proyectoSeleccionadoId, 'activo');
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Añadido', showConfirmButton: false, timer: 1500 });
        } else {
            Swal.fire('Error', data.message || 'No se pudo crear.', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Problema de red', 'error');
    } finally {
        btnGuardarInd.disabled = false;
        btnGuardarInd.innerHTML = 'Añadir';
    }
}

// Global para los onclick inline del HTML
window.abrirModalEditarIndicador = function(id) {
    const ind = indicadoresCargadas.find(i => i.id === id);
    if(!ind) return;
    
    document.getElementById('edit-indicador-id').value = id;
    
    let selectOpt = ind.area_aprendizaje;
    if(selectOpt.includes("Personal")) selectOpt = "Formación Personal y Social";
    else if(selectOpt.includes("Ambiente")) selectOpt = "Relación entre los Componentes del Ambiente";
    else if(selectOpt.includes("Comunicación")) selectOpt = "Comunicación y Representación";
    
    document.getElementById('edit-indicador-area').value = selectOpt;
    document.getElementById('edit-indicador-texto').value = ind.descripcion;
    
    const modal = document.getElementById('modal-editar-indicador');
    const content = document.getElementById('modal-editar-indicador-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

window.cerrarModalEditarIndicador = function() {
    const modal = document.getElementById('modal-editar-indicador');
    const content = document.getElementById('modal-editar-indicador-content');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function actualizarIndicador() {
    const id = document.getElementById('edit-indicador-id').value;
    const area = document.getElementById('edit-indicador-area').value;
    const texto = document.getElementById('edit-indicador-texto').value.trim();
    const btnActualizar = document.getElementById('btn-actualizar-indicador');
    
    if(!texto) {
        Swal.fire('Atención', 'Escribe una descripción.', 'warning'); return;
    }
    
    btnActualizar.disabled = true;
    btnActualizar.innerHTML = '<i class="ph-spinner animate-spin"></i>';
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const payload = { area_aprendizaje: area, descripcion: texto };
        
        const res = await fetch(`${baseUrl}/api/indicadores/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if(res.ok && data.success) {
            cerrarModalEditarIndicador();
            cargarIndicadoresDeProyecto(proyectoSeleccionadoId, 'activo');
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Actualizado', showConfirmButton: false, timer: 1500 });
        } else {
            Swal.fire('Error', data.message || 'No se pudo actualizar.', 'error');
        }
    } catch(e) {
        Swal.fire('Error', 'Falla de conexión', 'error');
    } finally {
        btnActualizar.disabled = false;
        btnActualizar.innerHTML = 'Actualizar';
    }
}

window.eliminarIndicador = async function(id) {
    Swal.fire({
        title: '¿Eliminar indicador?',
        text: 'Se borrará de este proyecto para siempre.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if(result.isConfirmed) {
            try {
                const token = localStorage.getItem('auth_token');
                const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
                
                const res = await fetch(`${baseUrl}/api/indicadores/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const data = await res.json();
                if(res.ok && data.success) {
                    cargarIndicadoresDeProyecto(proyectoSeleccionadoId, 'activo');
                } else {
                    Swal.fire('Error', data.message || 'No se pudo eliminar.', 'error');
                }
            } catch(e) {
                console.error(e);
                Swal.fire('Error', 'Problema de red.', 'error');
            }
        }
    });
}
