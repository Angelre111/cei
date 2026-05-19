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
    
    // Limpiamos la vista del proyecto cada vez que cambiamos de pestaña si existen los elementos
    const emptyState = document.getElementById('proyecto-empty-state');
    if (emptyState) emptyState.classList.remove('hidden');

    const projectContent = document.getElementById('proyecto-content');
    if (projectContent) projectContent.classList.add('hidden');

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
        const esActivo = estadoFiltroActual === 'activo';
        
        // Configuración de colores dinámica
        const themeColor = esActivo ? 'purple' : 'slate';
        const iconClass = esActivo ? 'ph-folder-open' : 'ph-archive';
        const badgeText = esActivo ? 'En Curso' : 'Finalizado';
        
        const div = document.createElement('div');
        // Estructura principal de la tarjeta
        div.className = `bg-white rounded-[2rem] p-6 border border-${themeColor}-50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-xl hover:shadow-${themeColor}-200/40 hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col relative overflow-hidden h-full`;
        
        // Formatear Fecha (createdAt) a formato corto.
        const fechaObj = new Date(proyecto.created_at);
        const fechaTxt = `${fechaObj.getDate().toString().padStart(2, '0')}/${(fechaObj.getMonth() + 1).toString().padStart(2, '0')}/${fechaObj.getFullYear()}`;
        
        div.innerHTML = `
            <!-- Decoración de fondo -->
            <div class="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-${themeColor}-100/60 to-${themeColor}-50/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700 pointer-events-none"></div>

            <div class="flex justify-between items-start mb-5 relative z-10">
                <div class="flex flex-col gap-2">
                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-${themeColor}-50 to-${themeColor}-100 flex items-center justify-center text-${themeColor}-600 shadow-inner group-hover:scale-110 transition-transform duration-300 shrink-0 border border-white">
                        <i class="ph-duotone ${iconClass} text-3xl"></i>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                    <span class="px-3 py-1 bg-${themeColor}-50 text-${themeColor}-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-${themeColor}-100 shadow-sm">
                        Momento ${proyecto.momento_pedagogico}
                    </span>
                    ${!esActivo ? `<span class="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-bold uppercase rounded flex items-center gap-1"><i class="ph-fill ph-lock"></i> Cerrado</span>` : ''}
                </div>
            </div>

            <div class="mb-6 relative z-10 flex-1">
                <h4 class="text-[17px] font-black text-slate-800 leading-snug group-hover:text-${themeColor}-600 transition-colors line-clamp-3" title="${proyecto.nombre}">
                    ${proyecto.nombre}
                </h4>
            </div>

            <div class="flex items-center justify-between border-t border-slate-100 pt-5 mt-auto relative z-10">
                <div class="flex items-center gap-2 text-slate-400">
                    <div class="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center">
                        <i class="ph-fill ph-calendar-blank text-sm"></i>
                    </div>
                    <span class="text-xs font-bold text-slate-500">${fechaTxt}</span>
                </div>
                <div class="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-${themeColor}-500 group-hover:text-white group-hover:shadow-lg group-hover:shadow-${themeColor}-200 transition-all">
                    <i class="ph-bold ph-arrow-right text-lg"></i>
                </div>
            </div>
        `;
        
        div.addEventListener('click', () => seleccionarProyecto(proyecto.id));
        container.appendChild(div);
    });
}

function seleccionarProyecto(id) {
    proyectoSeleccionadoId = id;
    // renderizarListaProyectos(proyectosCargados); // Opcional, para highlight en la lista si se mantiene
    
    const proyecto = proyectosCargados.find(p => p.id === id);
    if (!proyecto) return;

    // 1. Poblar el nuevo Modal Premium
    document.getElementById('proyecto-detalle-nombre').innerText = proyecto.nombre;
    
    const badgeEstado = document.getElementById('proyecto-detalle-estado');
    const btnCerrarOficial = document.getElementById('btn-cerrar-proyecto-oficial');
    
    if (proyecto.estado === 'cerrado') {
        badgeEstado.innerHTML = '<i class="ph-fill ph-lock"></i> Proyecto Finalizado';
        badgeEstado.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-200 mb-2';
        if (btnCerrarOficial) btnCerrarOficial.classList.add('hidden');
    } else {
        badgeEstado.innerHTML = '<i class="ph-fill ph-check-circle"></i> Proyecto Activo';
        badgeEstado.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100 mb-2';
        if (btnCerrarOficial) {
            btnCerrarOficial.classList.remove('hidden');
            // Re-vincular el evento de cerrar
            btnCerrarOficial.onclick = () => {
                cerrarModalVerProyecto();
                cerrarProyecto(proyecto.id);
            };
        }
    }

    // Diagnóstico (si no existe en el objeto, ponemos un placeholder amable)
    const diagDiv = document.getElementById('proyecto-detalle-diagnostico');
    if (diagDiv) {
        diagDiv.innerText = proyecto.diagnostico || 'Se observa interés en el grupo por explorar nuevas temáticas relacionadas con este proyecto. Se planifican actividades lúdicas y constructivas.';
    }

    // 2. Abrir el Modal
    if (typeof window.abrirModalVerProyecto === 'function') {
        window.abrirModalVerProyecto();
    }

    // 3. Cargar los indicadores (inyectará en el modal)
    if (typeof window.cargarIndicadoresDeProyecto === 'function') {
        window.cargarIndicadoresDeProyecto(proyecto.id, proyecto.estado);
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
    let mensajeConfirmacion = 'Los docentes ya no podrán seguir evaluando indicadores en este proyecto de forma activa. Pasará al historial.';
    
    // Verificar si el proyecto tiene indicadores asociados
    if (typeof indicadoresCargadas !== 'undefined' && indicadoresCargadas.length === 0) {
        mensajeConfirmacion = 'Este proyecto NO tiene indicadores registrados. ¿Estás seguro de que quieres cerrarlo?';
    }

    Swal.fire({
        title: '¿Cerrar Proyecto?',
        text: mensajeConfirmacion,
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
