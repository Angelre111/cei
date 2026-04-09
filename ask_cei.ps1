param(
    [Parameter(Mandatory=$true)]
    [string]$Pregunta,
    [string]$Archivos = "",
    [switch]$ModoInteractivo
)

$projectRoot = "C:\laragon\www\cei"
$systemPrompt = @"
Eres un asistente experto en desarrollo fullstack especializado en el proyecto 'cei'.
Stack: Python/Flask, HTML/Tailwind/JS, Supabase.
Reglas: responde en español, código PEP8, modular, con comentarios. Pide contexto si falta.
"@

# Función para obtener contenido de archivos especificados por el usuario
function ObtenerContextoArchivos {
    param([string]$patron)
    $resultado = ""
    $archivos = Get-ChildItem -Path $projectRoot -Recurse -Include $patron -Exclude ".venv","node_modules","__pycache__"
    foreach ($archivo in $archivos) {
        $rutaRelativa = $archivo.FullName.Replace($projectRoot, "").TrimStart("\")
        $resultado += "===== $rutaRelativa =====`n"
        $resultado += (Get-Content $archivo.FullName -Raw -ErrorAction SilentlyContinue) + "`n`n"
    }
    return $resultado
}

# Si el usuario especificó archivos (ej: "*.py, *.js")
if ($Archivos) {
    $contexto = ObtenerContextoArchivos -patron $Archivos
    $mensajeCompleto = @"
Contexto del proyecto (archivos solicitados):
$contexto

Mi pregunta: $Pregunta
"@
} else {
    $mensajeCompleto = $Pregunta
}

if ($ModoInteractivo) {
    # Modo interactivo con system prompt
    deepseek -S $systemPrompt
} else {
    # Consulta única
    deepseek -S $systemPrompt -q $mensajeCompleto
}
