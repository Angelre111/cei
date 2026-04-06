// ============================================
// LÓGICA DE PROYECTOS DE APRENDIZAJE
// ============================================

let proyectosCargados = [];
let proyectoSeleccionadoId = null;
let estadoFiltroActual = 'activo';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Listeners para el Modal de Crear Proyecto
    const btnGuardarProyecto = document.getElementById('btn-guardar-nuevo-proyecto');
    if (btnGuardarProyecto) {
        btnGuardarProyecto.addEventListener('click', crearNuevoProyecto);
    }
    
    // 2. Listener para Cerrar Proyecto
    const btnCerrarProyecto = document.getElementById('btn-cerrar-proyecto');
    if (btnCerrarProyecto) {
        btnCerrarProyecto.addEventListener('click', () => {
            if (proyectoSeleccionadoId) {
                cerrarProyecto(proyectoSeleccionadoId);
            }
        });
    }

    // Al iniciar, el filtro es "activos", pero la sección podría no estar lista.
    // Usaremos un listener personalizado o reintentaremos desde cargarDatosMiClase.
});

// Exponemos la función globalmente para que el HTML pueda llamarla onclick="filtrarProyectos('activos')"
window.filtrarProyectos = function(estado) {
    const tabActivos = document.getElementById('tab-proyectos-activos');
    const tabCerrados = document.getElementById('tab-proyectos-cerrados');
    
    if (!tabActivos || !tabCerrados) return; // Precaución
    
    if (estado === 'activos') {
        estadoFiltroActual = 'activo';
        tabActivos.classList.replace('bg-transparent', 'bg-white');
        tabActivos.classList.replace('text-gray-500', 'text-purple-600');
        tabActivos.classList.add('shadow-sm');
        
        tabCerrados.classList.replace('bg-white', 'bg-transparent');
        tabCerrados.classList.replace('text-purple-600', 'text-gray-500');
        tabCerrados.classList.remove('shadow-sm');
    } else {
        estadoFiltroActual = 'cerrado';
        tabCerrados.classList.replace('bg-transparent', 'bg-white');
        tabCerrados.classList.replace('text-gray-500', 'text-purple-600');
        tabCerrados.classList.add('shadow-sm');
        
        tabActivos.classList.replace('bg-white', 'bg-transparent');
        tabActivos.classList.replace('text-purple-600', 'text-gray-500');
        tabActivos.classList.remove('shadow-sm');
    }
    
    // Limpiamos la vista del proyecto cada vez que cambiamos de pestaña
    document.getElementById('proyecto-empty-state').classList.remove('hidden');
    document.getElementById('proyecto-content').classList.add('hidden');
    proyectoSeleccionadoId = null;

    cargarProyectosAPI();
};

window.cargarProyectosAPI = async function() {
    const seccionId = localStorage.getItem('seccion_activa_id');
    const container = document.getElementById('lista-proyectos-container');
    
    if (!seccionId) {
        return; // Esperamos a que el sistema cargue la asignación principal del docente
    }

    container.innerHTML = `
        <div class="text-center py-10 px-4">
            <i class="ph-duotone ph-spinner-gap animate-spin text-4xl text-purple-300 mb-2"></i>
            <p class="text-sm font-bold text-gray-400">Cargando...</p>
        </div>
    `;

    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        // Parámetro dinámico según pestaña activa
        const params = estadoFiltroActual === 'activo' ? '?estado=activos' : '?estado=cerrados';
        
        const res = await fetch(`${baseUrl}/api/proyectos/${seccionId}${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            proyectosCargados = data.data || [];
            renderizarListaProyectos(proyectosCargados);
        } else {
            console.error("Error al cargar proyectos:", data.message);
            container.innerHTML = `<div class="text-center py-5 text-red-500 text-xs">${data.message || 'Error'}</div>`;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="text-center py-5 text-red-500 text-xs">Error de red</div>`;
    }
}

function renderizarListaProyectos(lista) {
    const container = document.getElementById('lista-proyectos-container');
    
    if (lista.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 px-4 bg-white rounded-xl border border-dashed border-gray-200">
                <i class="ph-duotone ph-folder-dashed text-3xl text-gray-300 mb-2"></i>
                <p class="text-xs font-bold text-gray-400">No hay proyectos ${estadoFiltroActual === 'activo' ? 'activos' : 'cerrados'}.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    
    lista.forEach(proyecto => {
        const esSeleccionado = proyectoSeleccionadoId === proyecto.id;
        // Colores según selección o estado actual
        const bgColor = esSeleccionado ? "bg-purple-50 border-purple-200" : "bg-white border-gray-100 hover:border-purple-300";
        const iconColor = esSeleccionado ? "bg-purple-500 text-white" : "bg-purple-100 text-purple-600";
        
        const div = document.createElement('div');
        div.className = `flex gap-3 p-3 rounded-xl border cursor-pointer transition-all shadow-sm group ${bgColor}`;
        
        // Formatear Fecha (createdAt) a formato corto.
        const fechaObj = new Date(proyecto.created_at);
        const fechaTxt = `${fechaObj.getDate()}/${fechaObj.getMonth() + 1}/${fechaObj.getFullYear()}`;
        
        div.innerHTML = `
            <div class="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg flex-shrink-0 transition-colors ${iconColor}">
                ${proyecto.momento_pedagogico}
            </div>
            <div class="flex-1 min-w-0 flex flex-col justify-center">
                <h4 class="text-sm font-bold text-gray-800 truncate" title="${proyecto.nombre}">${proyecto.nombre}</h4>
                <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[10px] font-bold text-gray-400"><i class="ph-fill ph-calendar-blank"></i> Creado: ${fechaTxt}</span>
                </div>
            </div>
            <div class="flex items-center text-gray-300 ${esSeleccionado ? 'text-purple-400' : 'group-hover:text-purple-500'}">
                <i class="ph-bold ph-caret-right"></i>
            </div>
        `;
        
        div.addEventListener('click', () => seleccionarProyecto(proyecto.id));
        container.appendChild(div);
    });
}

function seleccionarProyecto(id) {
    proyectoSeleccionadoId = id;
    renderizarListaProyectos(proyectosCargados); // Para repintar la selección (Highlight visual)
    
    const proyecto = proyectosCargados.find(p => p.id === id);
    if (!proyecto) return;

    // Mostrar el contenedor de detalle y ocultar el empty state
    document.getElementById('proyecto-empty-state').classList.add('hidden');
    
    const content = document.getElementById('proyecto-content');
    content.classList.remove('hidden');
    
    // Poblar Header de Proyecto
    document.getElementById('detalle-momento-badge').innerText = `Momento ${proyecto.momento_pedagogico}`;
    document.getElementById('detalle-proyecto-nombre').innerText = proyecto.nombre;
    
    // Ocultar botón "Cerrar Proyecto" si ya está cerrado, y ocultar form de añadir indicador
    const btnCerrar = document.getElementById('btn-cerrar-proyecto');
    const formIndicador = document.getElementById('form-agregar-indicador');
    
    if (proyecto.estado === 'cerrado') {
        btnCerrar.classList.add('hidden');
        formIndicador.classList.add('hidden');
        document.getElementById('detalle-momento-badge').classList.replace('bg-purple-100', 'bg-gray-200');
        document.getElementById('detalle-momento-badge').classList.replace('text-purple-700', 'text-gray-600');
    } else {
        btnCerrar.classList.remove('hidden');
        formIndicador.classList.remove('hidden');
        document.getElementById('detalle-momento-badge').classList.replace('bg-gray-200', 'bg-purple-100');
        document.getElementById('detalle-momento-badge').classList.replace('text-gray-600', 'text-purple-700');
    }

    // Aquí cargamos usando el script nuevo:
    if (typeof window.cargarIndicadoresDeProyecto === 'function') {
        window.cargarIndicadoresDeProyecto(proyecto.id, proyecto.estado);
    } else {
        const listaIndicadores = document.getElementById('lista-indicadores-areas');
        listaIndicadores.innerHTML = `<div class="text-center py-10">Error: No se definió cargarIndicadoresDeProyecto</div>`;
    }
}

async function crearNuevoProyecto() {
    const btnGuardarProyecto = document.getElementById('btn-guardar-nuevo-proyecto');
    const seccionId = localStorage.getItem('seccion_activa_id');
    const nombreInput = document.getElementById('form-proyecto-nombre');
    const momentoRadios = document.getElementsByName('form-proyecto-momento');
    
    if (!seccionId) {
        Swal.fire('Error', 'No se detectó tu sección activa. Recarga la página.', 'error');
        return;
    }

    const nombre = nombreInput.value.trim();
    let momento = '';
    
    for (const radio of momentoRadios) {
        if (radio.checked) {
            momento = radio.value;
            break;
        }
    }

    if (!nombre) {
        Swal.fire('Faltan datos', 'Debes ingresar un nombre para el proyecto.', 'warning');
        return;
    }

    btnGuardarProyecto.disabled = true;
    btnGuardarProyecto.innerHTML = '<i class="ph-spinner animate-spin"></i> Creando...';

    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const payload = {
            seccion_id: seccionId,
            nombre: nombre,
            momento_pedagogico: momento
        };

        const res = await fetch(`${baseUrl}/api/proyectos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            Swal.fire({
                title: 'Proyecto Creado',
                text: 'El proyecto se guardó correctamente.',
                icon: 'success',
                confirmButtonColor: '#a855f7',
                customClass: { popup: 'rounded-3xl' }
            });
            window.cerrarModalProyecto();
            // Refrescar lista forzando el tab activo
            window.filtrarProyectos('activos');
        } else {
            Swal.fire('Error', data.message || 'No se pudo crear.', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error de red', 'No se pudo contactar al servidor.', 'error');
    } finally {
        btnGuardarProyecto.disabled = false;
        btnGuardarProyecto.innerHTML = 'Crear Proyecto';
    }
}

async function cerrarProyecto(proyectoId) {
    Swal.fire({
        title: '¿Cerrar Proyecto?',
        text: 'Los docentes ya no podrán seguir evaluando indicadores en este proyecto de forma activa. Pasará al historial.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#a855f7',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Sí, cerrar proyecto',
        cancelButtonText: 'Cancelar',
        customClass: { popup: 'rounded-3xl' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const token = localStorage.getItem('auth_token');
                const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
                
                // Mostrar loading
                Swal.fire({ title: 'Cerrando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                const res = await fetch(`${baseUrl}/api/proyectos/${proyectoId}/cerrar`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const data = await res.json();
                
                if (res.ok && data.success) {
                    Swal.fire({
                        title: '¡Finalizado!',
                        text: 'El proyecto se ha movido al historial con éxito.',
                        icon: 'success',
                        confirmButtonColor: '#a855f7',
                        customClass: { popup: 'rounded-3xl' }
                    });
                    
                    // Resetear la vista y recargar (ahora estaremos en "activos")
                    proyectoSeleccionadoId = null;
                    window.filtrarProyectos('activos');
                } else {
                    Swal.fire('Error', data.message || 'No se pudo cerrar.', 'error');
                }
            } catch (e) {
                console.error(e);
                Swal.fire('Error de red', 'Fallo de conexión.', 'error');
            }
        }
    });
}
