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

function renderizarIndicadores(estadoProyecto) {
    const container = document.getElementById('lista-indicadores-areas');
    if (!container) return;
    
    if (indicadoresCargadas.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200 mt-4">
                <i class="ph-duotone ph-list-checks text-4xl text-gray-300 mb-2"></i>
                <p class="text-sm font-bold text-gray-500">Este proyecto no tiene indicadores.</p>
            </div>`;
        return;
    }
    
    // Agrupar por área
    const agrupados = {
        "Formación Personal y Social": [],
        "Relación entre los Componentes del Ambiente": [],
        "Comunicación y Representación": []
    };
    
    indicadoresCargadas.forEach(ind => {
        let key = ind.area_aprendizaje;
        if(key.includes("Personal")) key = "Formación Personal y Social";
        else if(key.includes("Ambiente")) key = "Relación entre los Componentes del Ambiente";
        else if(key.includes("Comunicación")) key = "Comunicación y Representación";
        
        if(agrupados[key]) {
            agrupados[key].push(ind);
        } else {
            agrupados[ind.area_aprendizaje] = [ind];
        }
    });

    let html = '';
    
    // Renderizar caja por caja
    for (const [area, lista] of Object.entries(agrupados)) {
        if (lista.length === 0) continue;
        
        let colorBg, colorText, iconArea;
        if(area.includes('Formación') || area.includes('Personal')) {
            colorBg = 'bg-pink-50 border-pink-100'; colorText = 'text-pink-600'; iconArea = 'ph-user-circle';
        } else if(area.includes('Ambiente')) {
            colorBg = 'bg-green-50 border-green-100'; colorText = 'text-green-600'; iconArea = 'ph-plant';
        } else {
            colorBg = 'bg-blue-50 border-blue-100'; colorText = 'text-blue-600'; iconArea = 'ph-chats-circle';
        }
        
        let areaHTML = `
            <div class="${colorBg} border rounded-2xl p-4 shadow-sm mb-4">
                <h4 class="text-[11px] font-black ${colorText} uppercase tracking-widest mb-3 flex items-center gap-1.5 flex-shrink-0">
                    <i class="ph-fill ${iconArea}"></i> ${area}
                </h4>
                <div class="space-y-2">
        `;
        
        lista.forEach(ind => {
            const puedeBorrarUI = estadoProyecto === 'activo' ? `
                <div class="flex gap-1 flex-shrink-0">
                    <button onclick="abrirModalEditarIndicador('${ind.id}')" class="p-1.5 text-gray-400 hover:text-yellow-600 bg-white hover:bg-yellow-50 border border-transparent hover:border-yellow-200 rounded-lg transition-colors"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                    <button onclick="eliminarIndicador('${ind.id}')" class="p-1.5 text-gray-400 hover:text-red-500 bg-white hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors"><i class="ph-bold ph-trash text-sm"></i></button>
                </div>
            ` : '';
            
            areaHTML += `
                <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group">
                    <p class="text-sm font-medium text-gray-700 pr-4">${ind.descripcion}</p>
                    ${puedeBorrarUI}
                </div>
            `;
        });
        
        areaHTML += `</div></div>`;
        html += areaHTML;
    }
    
    container.innerHTML = html;
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
