.PHONY: help start stop restart logs docker-build docker-up docker-down victorialogs clean certs tls-on tls-off

## help: Show available commands
help:
	@echo "=== BTP Project Commands ==="
	@echo ""
	@echo "Infrastructure:"
	@echo "  make start       - Start all services (dev)"
	@echo "  make stop        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - Follow all logs"
	@echo "  make logs-app    - Follow app logs only"
	@echo "  make logs-nginx  - Follow nginx logs"
	@echo "  make logs-vlogs  - Follow VictoriaLogs logs"
	@echo ""
	@echo "Logs Stack:"
	@echo "  make victorialogs - Start VictoriaLogs only"
	@echo ""
	@echo "Reverse Proxy:"
	@echo "  make certs       - Generate self-signed TLS certificates for nginx"
	@echo "  make tls-on      - Enable HTTPS on nginx (redirect HTTP->HTTPS)"
	@echo "  make tls-off     - Disable TLS on nginx (HTTP only, no cert required)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up   - Build and start all containers"
	@echo "  make docker-down - Stop and remove containers"
	@echo "  make docker-build - Build API image only"
	@echo ""
	@echo "Development:"
	@echo "  make dev         - Start dev server (Bun)"
	@echo "  make migrate     - Run database migrations"
	@echo "  make test        - Run all tests"
	@echo "  make test-fast   - Run fast tests only"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean       - Clean logs and temporary files"
	@echo "  make backup      - Backup logs"
	@echo ""

## start: Start all services (PostgreSQL, Redis, VictoriaLogs, API, Nginx)
start:
	docker compose up -d postgres redis victorialogs
	@echo "Waiting for services to be healthy..."
	@docker compose up -d api
	@docker compose up -d nginx
	@echo ""
	@echo "=== Services Started ==="
	@echo "API (via nginx): https://localhost"
	@echo "PostgreSQL:      http://localhost:5432"
	@echo "Redis:           http://localhost:6379"
	@echo "VictoriaLogs:    http://localhost:9428"
	@echo ""
	@echo "Logs location: ./logs/"
	@echo "  - app.log              (general app logs)"
	@echo "  - security.log         (security events)"
	@echo "  - victorialogs/        (VictoriaLogs data)"

## stop: Stop all services
stop:
	docker compose down
	@echo "All services stopped."

## restart: Restart all services
restart:
	docker compose down
	docker compose up -d

## logs: Follow all container logs
logs:
	docker compose logs -f

## logs-app: Follow API logs only
logs-app:
	docker compose logs -f api
	@echo ""
	@echo "Or watch file logs:"
	@echo "  tail -f logs/app.log"
	@echo "  tail -f logs/security.log"

## logs-nginx: Follow nginx logs only
logs-nginx:
	docker compose logs -f nginx

## logs-vlogs: Follow VictoriaLogs logs
logs-vlogs:
	docker compose logs -f victorialogs

## victorialogs: Start VictoriaLogs only
victorialogs:
	docker compose up -d victorialogs
	@echo "VictoriaLogs starting at http://localhost:9428"

## certs: Generate self-signed TLS certificates for nginx (dev only)
certs:
	bash scripts/generate-certs.sh

## tls-on: Enable HTTPS on nginx (redirect HTTP->HTTPS)
tls-on:
	bash scripts/nginx-tls.sh on

## tls-off: Disable TLS on nginx (HTTP only, no cert required)
tls-off:
	bash scripts/nginx-tls.sh off

## docker-up: Build and start everything
docker-up:
	docker compose up --build -d
	@echo ""
	@echo "=== All Services Running ==="
	@docker compose ps

## docker-down: Stop and remove everything
docker-down:
	docker compose down -v
	@echo "All containers and volumes removed."

## docker-build: Build API image only
docker-build:
	docker build -t btp-api:latest .
	@echo "API image built: btp-api:latest"

## dev: Start development server
dev:
	bun run dev

## migrate: Run database migrations
migrate:
	bun run migrate

## test: Run all tests
test:
	bun test

## test-fast: Run fast tests only
test-fast:
	bun test src/libs/ test/api/pentest-full.test.ts test/api/security-events.test.ts

## clean: Clean logs and temp files
clean:
	@echo "Cleaning logs..."
	@rm -f logs/app.log logs/security.log
	@echo "Clean complete."

## backup: Backup logs
backup:
	@mkdir -p logs/backup
	@timestamp=$$(date +%Y%m%d-%H%M%S)
	@cp logs/app.log logs/backup/app-$${timestamp}.log 2>/dev/null || true
	@cp logs/security.log logs/backup/security-$${timestamp}.log 2>/dev/null || true
	@echo "Logs backed up to logs/backup/"
