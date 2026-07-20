#!/usr/bin/env python3
# =======================================================
#   GENERADOR DE FICHA DE INSCRIPCIÓN EN BLANCO
#   C.E.I. "LA PARAGUA"
#
#   Uso:
#       python generar_ficha_blanca.py
#
#   Genera: Ficha_Inscripcion_BLANCA.pdf
#   en el directorio donde se ejecuta el script.
# =======================================================

import os
import sys
from io import BytesIO

# Asegurar encoding UTF-8 en Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# --- ReportLab ---
try:
    from reportlab.lib.pagesizes import letter, portrait
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle,
        Paragraph, Spacer, Image
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
except ImportError:
    print("❌  ReportLab no está instalado.")
    print("    Ejecuta:  pip install reportlab")
    sys.exit(1)


# ------------------------------------------------------------------
# CONFIGURACIÓN
# ------------------------------------------------------------------
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR     = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
LOGO_PATH    = os.path.join(ROOT_DIR, 'img', 'cei.png')
OUTPUT_FILE  = os.path.join(ROOT_DIR, 'Ficha_Inscripcion_BLANCA.pdf')


# ------------------------------------------------------------------
# FUNCIÓN PRINCIPAL
# ------------------------------------------------------------------
def generar_ficha_blanca():
    pdf_buffer = BytesIO()

    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=portrait(letter),
        rightMargin=30,
        leftMargin=30,
        topMargin=15,
        bottomMargin=15,
    )
    elements = []
    styles = getSampleStyleSheet()

    # ── Estilos ───────────────────────────────────────────────────
    section_title_style = ParagraphStyle(
        name='SectionTitle',
        fontName='Helvetica-Bold',
        fontSize=9.5,
        textColor=colors.HexColor("#0F172A"),
    )
    data_style = ParagraphStyle(
        name='DataStyle',
        fontName='Helvetica',
        fontSize=8.5,
        textColor=colors.HexColor("#1E293B"),
    )
    bold_style = ParagraphStyle(
        name='BoldStyle',
        fontName='Helvetica-Bold',
        fontSize=8.5,
        textColor=colors.HexColor("#0F172A"),
    )

    # ── Helpers ───────────────────────────────────────────────────
    def lbl(texto):
        """Etiqueta en negrita."""
        return Paragraph(f"<b>{texto}</b>", bold_style)

    def campo():
        """Celda vacía para escribir a mano."""
        return Paragraph("&nbsp;", data_style)

    def create_section_header(title_text):
        """Encabezado de sección con fondo gris claro."""
        p = Paragraph(title_text, section_title_style)
        t = Table([[p]], colWidths=[7.2 * inch])
        t.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, -1), colors.HexColor("#F1F5F9")),
            ('TOPPADDING',    (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING',   (0, 0), (-1, -1), 6),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 6),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        t.spaceBefore = 4
        t.spaceAfter  = 2
        return t

    def create_data_table(data_matrix, row_height=20):
        """Crea la tabla básica con las dimensiones correctas de fila."""
        num_rows = len(data_matrix)
        t = Table(
            data_matrix,
            colWidths=[1.45 * inch, 2.15 * inch, 1.2 * inch, 2.4 * inch],
            rowHeights=[row_height] * num_rows
        )
        return t

    def get_base_table_style():
        """Retorna el estilo base común para las tablas de datos."""
        return [
            ('FONTNAME',      (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE',      (0, 0), (-1, -1), 8.5),
            ('TEXTCOLOR',     (0, 0), (-1, -1), colors.HexColor("#334155")),
            ('BACKGROUND',    (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ('BOX',           (0, 0), (-1, -1), 1,   colors.HexColor("#E2E8F0")),
            ('INNERGRID',     (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING',    (0, 0), (-1, -1), 2),
            ('LEFTPADDING',   (0, 0), (-1, -1), 4),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ]

    def get_field_underlines(num_rows, spanned_rows=[]):
        """Genera dinámicamente líneas inferiores oscuras en los campos de entrada."""
        style_cmds = []
        for r in range(num_rows):
            if r in spanned_rows:
                # Línea en la celda expandida (cubre col 1 a 3)
                style_cmds.append(('LINEBELOW', (1, r), (3, r), 0.75, colors.HexColor("#94A3B8")))
            else:
                # Líneas en las columnas de entrada individuales (col 1 y col 3)
                style_cmds.append(('LINEBELOW', (1, r), (1, r), 0.75, colors.HexColor("#94A3B8")))
                style_cmds.append(('LINEBELOW', (3, r), (3, r), 0.75, colors.HexColor("#94A3B8")))
        return style_cmds

    # ── 1. ENCABEZADO CON LOGO ────────────────────────────────────
    # Ajustamos el tamaño a 0.9 pulgadas para ahorrar espacio vertical
    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=0.9 * inch, height=0.9 * inch)
    else:
        logo = Paragraph("")

    header_text = """
    <para align="center">
        <font size="9" color="#475569"><b>MINISTERIO DEL PODER POPULAR PARA LA EDUCACIÓN</b></font><br/>
        <font size="11" color="#1E293B"><b>C.E.I. "LA PARAGUA"</b></font><br/>
        <font size="8" color="#64748B">MUNICIPIO ANGOSTURA DEL ORINOCO - CIUDAD BOLÍVAR - ESTADO BOLÍVAR</font><br/>
        <font size="11.5" color="#2563EB"><b>FICHA DE INSCRIPCIÓN (PARA LLENAR A MANO)</b></font>
    </para>
    """
    p_header = Paragraph(header_text, styles['Normal'])
    t_header = Table(
        [[logo, p_header, ""]],
        colWidths=[1.0 * inch, 5.2 * inch, 1.0 * inch],
    )
    t_header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN',  (1, 0), (1,  0),  'CENTER'),
    ]))
    elements.append(t_header)
    elements.append(Spacer(1, 6))

    # ── 2. SECCIÓN: DATOS DEL ESTUDIANTE ──────────────────────────
    elements.append(create_section_header("Datos del Estudiante"))
    d_estudiante = [
        [lbl("Nombres:"),          campo(), lbl("Apellidos:"),          campo()],
        [lbl("Cédula Escolar:"),   campo(), lbl("Sexo:"),               campo()],
        [lbl("Fecha Nacimiento:"), campo(), lbl("Edad:"),               campo()],
        [lbl("Lugar de Nac.:"),    campo(), lbl("Sección:"),            campo()],
        [lbl("Dirección:"),        campo(), Paragraph("", data_style),  Paragraph("", data_style)],
    ]
    t1 = create_data_table(d_estudiante, row_height=20)
    t1_style = get_base_table_style() + [('SPAN', (1, 4), (3, 4))] + get_field_underlines(5, [4])
    t1.setStyle(TableStyle(t1_style))
    elements.append(t1)
    elements.append(Spacer(1, 4))

    # ── 3. SECCIÓN: DATOS FAMILIARES Y VIVIENDA ───────────────────
    elements.append(create_section_header("Datos Familiares y de Vivienda"))
    d_familia = [
        [lbl("Nombre de la Madre:"), campo(), lbl("C.I. Madre:"),      campo()],
        [lbl("Teléfono Madre:"),     campo(), lbl("Ocupación:"),        campo()],
        [lbl("Nombre del Padre:"),   campo(), lbl("Teléfono Padre:"),   campo()],
        [lbl("Dirección Hab.:"),     campo(), Paragraph("", data_style), Paragraph("", data_style)],
        [lbl("Tipo de Vivienda:"),   campo(), lbl("Tenencia:"),         campo()],
    ]
    t2 = create_data_table(d_familia, row_height=20)
    t2_style = get_base_table_style() + [('SPAN', (1, 3), (3, 3))] + get_field_underlines(5, [3])
    t2.setStyle(TableStyle(t2_style))
    elements.append(t2)
    elements.append(Spacer(1, 4))

    # ── 4. SECCIÓN: ANTECEDENTES DE SALUD ────────────────────────
    elements.append(create_section_header("Antecedentes de Salud y Nacimiento"))
    d_salud = [
        [lbl("¿Fue Cesárea?"),     campo(), lbl("¿Es Prematuro?"),     campo()],
        [lbl("Peso al Nacer (kg):"), campo(), lbl("Talla al Nacer (cm):"), campo()],
        [lbl("¿Es Alérgico?"),     campo(), lbl("Enfermedad Crónica:"), campo()],
        [lbl("Med. para Fiebre:"), campo(), Paragraph("", data_style),  Paragraph("", data_style)],
    ]
    t3 = create_data_table(d_salud, row_height=20)
    t3_style = get_base_table_style() + [('SPAN', (1, 3), (3, 3))] + get_field_underlines(4, [3])
    t3.setStyle(TableStyle(t3_style))
    elements.append(t3)
    elements.append(Spacer(1, 4))

    # ── 5. SECCIÓN: HÁBITOS Y DIAGNÓSTICO ────────────────────────
    elements.append(create_section_header("Hábitos y Diagnóstico Inicial"))
    d_habitos = [
        [lbl("¿Come Solo?"),        campo(), lbl("Hora de Dormir:"),   campo()],
        [lbl("Diagnóstico Inicial:"), campo(), Paragraph("", data_style), Paragraph("", data_style)],
    ]
    t4 = create_data_table(d_habitos, row_height=20)
    t4_style = get_base_table_style() + [('SPAN', (1, 1), (3, 1))] + get_field_underlines(2, [1])
    t4.setStyle(TableStyle(t4_style))
    elements.append(t4)
    elements.append(Spacer(1, 4))

    # ── 6. SECCIÓN: CONDUCTA / COMPORTAMIENTO ────────────────────
    elements.append(create_section_header("Comportamiento / Conducta Observada"))
    conductas = [
        "Agresivo(a)",         "Tímido(a)",        "Sociable",
        "Ansioso(a)",          "Tranquilo(a)",      "Inquieto(a)",
        "Introvertido(a)",     "Extrovertido(a)",   "Colaborador(a)",
        "Berrinches",          "Llorón(a)",         "Cariñoso(a)",
    ]

    conducta_rows = []
    for i in range(0, len(conductas), 3):
        fila = []
        for j in range(3):
            idx = i + j
            if idx < len(conductas):
                fila.append(Paragraph(f"☐  {conductas[idx]}", data_style))
            else:
                fila.append(Paragraph("", data_style))
        conducta_rows.append(fila)

    t_conducta = Table(
        conducta_rows,
        colWidths=[2.4 * inch, 2.4 * inch, 2.4 * inch],
        rowHeights=[16] * len(conducta_rows)
    )
    t_conducta.setStyle(TableStyle([
        ('FONTNAME',      (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE',      (0, 0), (-1, -1), 8.5),
        ('BACKGROUND',    (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX',           (0, 0), (-1, -1), 1,   colors.HexColor("#E2E8F0")),
        ('INNERGRID',     (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(t_conducta)

    # Fila extra para conducta no listada
    t_conducta_extra = Table(
        [[lbl("Otra conducta:"), campo()]],
        colWidths=[1.8 * inch, 5.4 * inch],
        rowHeights=[20]
    )
    t_conducta_extra_style = [
        ('FONTNAME',      (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE',      (0, 0), (-1, -1), 8.5),
        ('TEXTCOLOR',     (0, 0), (-1, -1), colors.HexColor("#334155")),
        ('BACKGROUND',    (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX',           (0, 0), (-1, -1), 1,   colors.HexColor("#E2E8F0")),
        ('INNERGRID',     (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW',     (1, 0), (1, 0), 0.75, colors.HexColor("#94A3B8")),
    ]
    t_conducta_extra.setStyle(TableStyle(t_conducta_extra_style))
    elements.append(t_conducta_extra)
    elements.append(Spacer(1, 12))

    # ── 7. FIRMAS ─────────────────────────────────────────────────
    firmas_data = [
        [
            "___________________________",
            "___________________________",
            "___________________________",
        ],
        ["Director(a)", "Sello", "Representante"],
    ]
    t_firmas = Table(
        firmas_data,
        colWidths=[2.4 * inch, 2.4 * inch, 2.4 * inch],
        rowHeights=[16, 16]
    )
    t_firmas.setStyle(TableStyle([
        ('ALIGN',       (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME',    (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE',    (0, 0), (-1, -1), 9),
        ('TEXTCOLOR',   (0, 0), (-1, -1), colors.HexColor("#475569")),
        ('TOPPADDING',  (0, 1), (-1,  1), 4),
    ]))
    elements.append(t_firmas)

    # ── CONSTRUIR PDF ─────────────────────────────────────────────
    doc.build(elements)
    pdf_buffer.seek(0)

    with open(OUTPUT_FILE, 'wb') as f:
        f.write(pdf_buffer.read())

    print(f"✅  Ficha generada correctamente:")
    print(f"    {OUTPUT_FILE}")


# ------------------------------------------------------------------
# PUNTO DE ENTRADA
# ------------------------------------------------------------------
if __name__ == '__main__':
    generar_ficha_blanca()
