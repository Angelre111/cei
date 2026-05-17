#!/usr/bin/env bash
set -e

echo "📦 Instalando LibreOffice para conversión DOCX→PDF..."
apt-get update -qq
apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    fonts-liberation \
    fonts-dejavu

echo "🐍 Instalando dependencias Python..."
pip install -r requirements.txt

echo "✅ Build completo."
