FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY cybergame ./cybergame
COPY scenario ./scenario

EXPOSE 8000
CMD ["uvicorn", "cybergame.server:app", "--host", "0.0.0.0", "--port", "8000"]
