
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Docxtemplater from 'https://esm.sh/docxtemplater'
import PizZip from 'https://esm.sh/pizzip'

serve(async (req) => {
  try {
    const { record } = await req.json()
    
    // 2. Inicializar cliente de Supabase con Service Role (para saltar RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Descargar la plantilla desde tu Bucket 'plantillas'
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('plantillas')
      .download('inscripcion_template.docx')

    if (downloadError) throw new Error(`Error descargando plantilla: ${downloadError.message}`)

    const content = await fileData.arrayBuffer()
    const zip = new PizZip(content)
    const doc = new Docxtemplater(zip, { 
      paragraphLoop: true, 
      linebreaks: true,
      nullGetter() { return "________________" } // Si el dato es null, pone una línea
    })

    // 4. Mapeo de datos (Asegúrate que coincidan con tus llaves {} en el Word)
    doc.render({
      // Paso 1: Estudiante
      nombres_estudiante: record.nombres_estudiante,
      apellidos_estudiante: record.apellidos_estudiante,
      fecha_nacimiento: record.fecha_nacimiento,
      edad_estudiante: record.edad_estudiante,
      sexo: record.sexo,
      lugar_nacimiento: record.lugar_nacimiento,
      cedula_escolar: record.cedula_escolar,
      direccion: record.direccion_habitacion,
      
      // Paso 2: Padres
      nombre_madre: record.nombre_madre,
      ci_madre: record.ci_madre,
      telefono_madre: record.telefono_madre,
      ocupacion_madre: record.ocupacion_madre,
      nombre_padre: record.nombre_padre,
      telefono_padre: record.telefono_padre,
      tipo_vivienda: record.tipo_vivienda,
      tenencia_vivienda: record.tenencia_vivienda,

      // Paso 3: Salud (Booleano a Texto)
      cesarea: record.fue_cesarea ? "SÍ" : "NO",
      prematuro: record.es_prematuro ? "SÍ" : "NO",
      alergico: record.es_alergico ? "SÍ" : "NO",
      peso: record.peso_nacer,
      talla: record.talla_nacer,
      enfermedad: record.enfermedad_cronica,
      medicina: record.medicamento_fiebre,

      // Paso 4: Hábitos
      come_solo: record.come_solo,
      hora_dormir: record.hora_dormir,
      // Para el diagnóstico (array), los unimos por comas
      diagnostico: record.diagnostico_inicial?.join(", ") || ""
    })

    // 5. Generar el buffer del nuevo archivo
    const buffer = doc.getZip().generate({ type: 'uint8array' })

    // 6. Subir el archivo generado al bucket 'inscripciones_finales'
    const nombreArchivo = `inscripcion_${record.id}_${Date.now()}.docx`
    const { error: uploadError } = await supabase.storage
      .from('inscripciones_finales')
      .upload(nombreArchivo, buffer, { 
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true 
      })

    if (uploadError) throw uploadError

    return new Response(JSON.stringify({ ok: true, file: nombreArchivo }), { 
      headers: { "Content-Type": "application/json" },
      status: 200 
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { "Content-Type": "application/json" },
      status: 500 
    })
  }
})
