FROM python:3.12-slim

RUN pip install --no-cache-dir psycopg2-binary requests boto3 ijson

WORKDIR /app
COPY scripts/ ./scripts/
COPY server.py .

EXPOSE 8080
CMD ["python3", "server.py"]
