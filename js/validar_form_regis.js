
document.getElementById('registroForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    nombre_completo: document.getElementById('nombre_completo').value,
    email: document.getElementById('email').value,
    telefono: document.getElementById('telefono').value,
    contrasena: document.getElementById('contrasena').value
  };

  try {
    const res = await fetch('/api/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const json = await res.json();
    if (res.ok) {
      alert(json.message || 'Registro exitoso');
      // redirigir o limpiar form según quieras
    } else {
      alert(json.message || 'Error: ' + res.status);
    }
  } catch (err) {
    console.error('Error al conectar con el servidor:', err);
    alert('Error de red o del servidor');
  }
});