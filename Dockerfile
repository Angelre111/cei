# Usar una imagen oficial de Python ligera
FROM python:3.11-slim

# Instalar LibreOffice, fuentes del sistema, cliente PostgreSQL (pg_dump) y limpiar la caché de apt
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    fonts-liberation \
    fonts-dejavu \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Definir directorio de trabajo en el contenedor
WORKDIR /app

# Copiar requerimientos e instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar todo el código del proyecto al contenedor
COPY . .

# Indicar el puerto en el que escuchará el contenedor (Render lo mapea dinámicamente)
EXPOSE 10000

# Comando para iniciar la aplicación Gunicorn leyendo la variable PORT asignada por Render
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-10000} py.form_registro:app"]
