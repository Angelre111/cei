// ============================================
// LÓGICA DEL BANCO DE RECOMENDACIONES
// ============================================

let recomendacionesCargadas = [];
let recomendacionEditandoId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Escuchar botón de guardar/actualizar recomendación
    const btnGuardar = document.getElementById('btn-guardar-chip');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', () => {
            if (recomendacionEditandoId) {
                actualizarRecomendacion(recomendacionEditandoId);
            } else {
                crearRecomendacion();
            }
        });
    }
});

function abrirModalBancoRecomendaciones() {
    const modal = document.getElementById('modal-banco-recomendaciones');
    const content = document.getElementById('modal-recomendaciones-content');
    
    // Limpiar el form
    cancelarEdicionRecomendacion();
    
    // Cargar la data
    cargarRecomendacionesAPI();
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function cerrarModalBancoRecomendaciones() {
    const modal = document.getElementById('modal-banco-recomendaciones');
    const content = document.getElementById('modal-recomendaciones-content');
    
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// Para usar fuera del modal (se llama indirectamente de tooltip)
function insertarRecomendacion(texto) {
    const textarea = document.getElementById('eval-recomendacion');
    if (textarea) {
        if (textarea.value.trim() !== '') {
            textarea.value += ' ' + texto;
        } else {
            textarea.value = texto;
        }
        // focus
        textarea.focus();
    }
}

// Para usar dentro de modal
function insertarRecomendacionYcerrar(texto) {
    insertarRecomendacion(texto);
    cerrarModalBancoRecomendaciones();
    
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Recomendación insertada',
        showConfirmButton: false,
        timer: 1500
    });
}

async function cargarRecomendacionesAPI() {
    const seccionId = localStorage.getItem('seccion_activa_id');
    const container = document.getElementById('lista-banco-recomendaciones');
    
    if (!seccionId) {
        if (container) container.innerHTML = `<div class="text-sm text-red-500 px-4">Error: No hay sección activa.</div>`;
        return;
    }
    
    if (container) {
        container.innerHTML = `<div class="text-center py-4"><i class="ph-spinner animate-spin text-2xl text-indigo-300"></i></div>`;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const res = await fetch(`${baseUrl}/api/recomendaciones/${seccionId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            recomendacionesCargadas = data.data || [];
            if (container) renderizarRecomendaciones();
            actualizarChipsRapidos();
        } else {
            if (container) container.innerHTML = `<div class="text-sm text-red-500">${data.message || 'Error'}</div>`;
        }
    } catch (e) {
        console.error(e);
        if (container) container.innerHTML = `<div class="text-sm text-red-500">Error de conexión</div>`;
    }
}

function renderizarRecomendaciones() {
    const container = document.getElementById('lista-banco-recomendaciones');
    if (!container) return;

    container.innerHTML = '';
    
    if (recomendacionesCargadas.length === 0) {
        container.innerHTML = `<div class="text-sm text-gray-400 text-center py-4 bg-white rounded-xl border border-dashed border-gray-200">No hay recomendaciones guardadas.<br><span class="text-xs">Crea una rápida arriba.</span></div>`;
        return;
    }
    
    recomendacionesCargadas.forEach(rec => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-indigo-300 transition-colors group";
        
        div.innerHTML = `
            <div class="flex-1 min-w-0 pr-4 cursor-pointer" onclick="insertarRecomendacionYcerrar(\`${rec.texto.replace(/`/g, "'")}\`)">
                <span class="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded mb-1">${rec.titulo}</span>
                <p class="text-sm text-gray-600 font-medium truncate">${rec.texto}</p>
            </div>
            <div class="flex gap-1">
                <button onclick="editarRecomendacionUI('${rec.id}')" class="p-1.5 text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                <button onclick="eliminarRecomendacion('${rec.id}')" class="p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar"><i class="ph-bold ph-trash text-sm"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
}

function actualizarChipsRapidos() {
    // 1. Manejar chips (si existen en otros paneles)
    const container = document.getElementById('eval-chips-container');
    if (container) {
        // Chips estáticos siempre presentes
        const chipsEstaticos = `
            <button type="button" onclick="insertarRecomendacion('¡Felicidades por tus logros este lapso! Sigue así.')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-lg text-[11px] font-bold transition-colors">
                <i class="ph-bold ph-star mr-1"></i> Felicitación
            </button>
            <button type="button" onclick="insertarRecomendacion('Se recomienda reforzar el repaso en el hogar.')" class="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-100 rounded-lg text-[11px] font-bold transition-colors">
                <i class="ph-bold ph-house mr-1"></i> Repaso en Hogar
            </button>
        `;

        // Botón especial para agregar mas (abre el modal)
        const btnMas = `<button type="button" onclick="abrirModalBancoRecomendaciones()" class="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 border border-gray-200 rounded-lg text-[11px] font-bold transition-colors border-dashed ml-auto">
                            <i class="ph-bold ph-plus"></i> Gestionar Banco
                        </button>`;
                        
        // Renderizar recomendaciones desde Supabase
        let chipsHTML = '';
        const maxChips = Math.min(3, recomendacionesCargadas.length);
        for(let i=0; i<maxChips; i++) {
            const rec = recomendacionesCargadas[i];
            const clases = ['bg-pink-50 text-pink-700 border-pink-100', 'bg-emerald-50 text-emerald-700 border-emerald-100', 'bg-cyan-50 text-cyan-700 border-cyan-100'];
            const claseColor = clases[i % clases.length];
            
            chipsHTML += `
                <button type="button" onclick="insertarRecomendacion(\`${rec.texto.replace(/`/g, "'")}\`)" class="px-3 py-1.5 ${claseColor} hover:bg-white rounded-lg text-[11px] font-bold transition-colors shadow-sm capitalize">
                    <i class="ph-bold ph-chat-circle mr-1"></i> ${rec.titulo.substring(0, 15)}
                </button>
            `;
        }
        
        container.innerHTML = chipsEstaticos + chipsHTML + btnMas;
    }

    // 2. Manejar Select Dinámico (Banco Rápido del nuevo panel)
    const bancoSelect = document.getElementById('eval-banco-select');
    if (bancoSelect) {
        // Limpiar excepto el primero
        const currentVal = bancoSelect.value;
        bancoSelect.innerHTML = '<option value="">-- Usar frase del banco --</option>';
        
        // Frases por defecto
        const defaultPhrases = [
            "¡Felicidades por tus logros este lapso! Sigue así.",
            "Muestra gran interés en las actividades grupales.",
            "Se recomienda reforzar el repaso en el hogar.",
            "Ha logrado consolidar los indicadores satisfactoriamente."
        ];

        defaultPhrases.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p.length > 40 ? p.substring(0, 40) + "..." : p;
            bancoSelect.appendChild(opt);
        });

        // Frases personalizadas de la API
        if (recomendacionesCargadas.length > 0) {
            const group = document.createElement('optgroup');
            group.label = "Mis Frases Guardadas";
            
            recomendacionesCargadas.forEach(rec => {
                const opt = document.createElement('option');
                opt.value = rec.texto;
                opt.textContent = rec.titulo;
                group.appendChild(opt);
            });
            bancoSelect.appendChild(group);
        }

        bancoSelect.value = currentVal;
    }
}

async function crearRecomendacion() {
    const seccionId = localStorage.getItem('seccion_activa_id');
    const inputTitulo = document.getElementById('nuevo-chip-titulo');
    const inputTexto = document.getElementById('nuevo-chip-texto');
    const btnGuardar = document.getElementById('btn-guardar-chip');
    
    const titulo = inputTitulo.value.trim();
    const texto = inputTexto.value.trim();
    
    if (!titulo || !texto) {
        Swal.fire('Atención', 'Debes escribir el título y el texto de la recomendación.', 'warning');
        return;
    }
    
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="ph-spinner animate-spin"></i>';
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const payload = { seccion_id: seccionId, titulo: titulo, texto: texto };
        
        const res = await fetch(`${baseUrl}/api/recomendaciones`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            inputTitulo.value = '';
            inputTexto.value = '';
            cargarRecomendacionesAPI();
        } else {
            Swal.fire('Error', data.message || 'No se pudo crear', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Falla de conexión', 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = 'Guardar';
    }
}

function editarRecomendacionUI(id) {
    const rec = recomendacionesCargadas.find(r => r.id === id);
    if (!rec) return;
    
    recomendacionEditandoId = id;
    document.getElementById('nuevo-chip-titulo').value = rec.titulo;
    document.getElementById('nuevo-chip-texto').value = rec.texto;
    
    const btnGuardar = document.getElementById('btn-guardar-chip');
    btnGuardar.innerHTML = 'Actualizar';
    btnGuardar.classList.replace('bg-indigo-500', 'bg-yellow-500');
    btnGuardar.classList.replace('hover:bg-indigo-600', 'hover:bg-yellow-600');
    
    // Focus en título
    document.getElementById('nuevo-chip-titulo').focus();
}

function cancelarEdicionRecomendacion() {
    recomendacionEditandoId = null;
    
    const inputTitulo = document.getElementById('nuevo-chip-titulo');
    const inputTexto = document.getElementById('nuevo-chip-texto');
    if (inputTitulo) inputTitulo.value = '';
    if (inputTexto) inputTexto.value = '';
    
    const btnGuardar = document.getElementById('btn-guardar-chip');
    if(btnGuardar && btnGuardar.innerHTML === 'Actualizar') {
        btnGuardar.innerHTML = 'Guardar';
        btnGuardar.classList.replace('bg-yellow-500', 'bg-indigo-500');
        btnGuardar.classList.replace('hover:bg-yellow-600', 'hover:bg-indigo-600');
    }
}

async function actualizarRecomendacion(id) {
    const inputTitulo = document.getElementById('nuevo-chip-titulo');
    const inputTexto = document.getElementById('nuevo-chip-texto');
    const btnGuardar = document.getElementById('btn-guardar-chip');
    
    const titulo = inputTitulo.value.trim();
    const texto = inputTexto.value.trim();
    
    if (!titulo || !texto) {
        Swal.fire('Atención', 'Debes escribir el título y el texto.', 'warning');
        return;
    }
    
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="ph-spinner animate-spin"></i>';
    
    try {
        const token = localStorage.getItem('auth_token');
        const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://127.0.0.1:5000';
        
        const payload = { titulo: titulo, texto: texto };
        
        const res = await fetch(`${baseUrl}/api/recomendaciones/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            cancelarEdicionRecomendacion();
            cargarRecomendacionesAPI();
        } else {
            Swal.fire('Error', data.message || 'No se pudo actualizar', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Falla de conexión', 'error');
    } finally {
        btnGuardar.disabled = false;
        if (!recomendacionEditandoId) {
            btnGuardar.innerHTML = 'Guardar';
        } else {
            btnGuardar.innerHTML = 'Actualizar';
        }
    }
}

async function eliminarRecomendacion(id) {
    Swal.fire({
        title: '¿Eliminar?',
        text: 'Se borrará permanentemente de tu banco.',
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
                
                const res = await fetch(`${baseUrl}/api/recomendaciones/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const data = await res.json();
                if(res.ok && data.success) {
                    cargarRecomendacionesAPI();
                } else {
                    Swal.fire('Error', data.message || 'No se pudo eliminar', 'error');
                }
            } catch(e) {
                console.error(e);
                Swal.fire('Error', 'Problema de red', 'error');
            }
        }
    });
}
