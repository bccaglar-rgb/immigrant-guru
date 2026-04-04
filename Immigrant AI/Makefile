.PHONY: infra-up infra-down infra-logs web-install api-install worker-install dev-web dev-api dev-worker test-api

infra-up:
	docker compose up -d postgres redis

infra-down:
	docker compose down

infra-logs:
	docker compose logs -f postgres redis

web-install:
	cd apps/web && npm install

api-install:
	cd apps/api && python3 -m pip install -e ".[dev]"

worker-install:
	cd apps/worker && python3 -m pip install -e ".[dev]"

dev-web:
	cd apps/web && npm run dev

dev-api:
	cd apps/api && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-worker:
	cd apps/worker && python3 -m app.main

test-api:
	cd apps/api && pytest
