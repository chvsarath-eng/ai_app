FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system fonts + curl for font downloads
# Also install fontconfig for font management and Liberation fonts as fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    fonts-liberation \
    fontconfig \
    curl \
    ca-certificates \
  && fc-cache -fv \
  && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY . /app

# Default book font settings (can be overridden in Cloud Run)
# Set font environment variables to use the reliable, static Liberation fonts 
# (already installed via fonts-liberation apt package)
ENV BOOK_FONT_REGULAR=/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf \
    BOOK_FONT_BOLD=/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf \
    BOOK_FONT_ITALIC=/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf \
    BOOK_FONTS_DIR=/usr/share/fonts/truetype/liberation

# Run as non-root (recommended for Cloud Run)
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
  && chown -R appuser:appuser /app
USER appuser

# Cloud Run sends requests to $PORT (default 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn story_fastapi:app --host 0.0.0.0 --port ${PORT:-8080}"]


