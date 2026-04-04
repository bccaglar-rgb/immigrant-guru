FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY apps/worker/pyproject.toml ./pyproject.toml
COPY apps/worker/app ./app

RUN pip install --upgrade pip \
    && pip install -e ".[dev]"

CMD ["python3", "-m", "app.main"]
