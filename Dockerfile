FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY cybergame ./cybergame
COPY scenario ./scenario

EXPOSE 8000
EXPOSE 8100
ENV PORT=8000
CMD ["python", "-m", "cybergame.run_dual"]
