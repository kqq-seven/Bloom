FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BLOOM_HOST=0.0.0.0 \
    PORT=4173 \
    BLOOM_DATABASE=/data/bloom.sqlite3

WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 4173
CMD ["python", "server.py"]
