.PHONY: help start stop restart logs docker-build docker-up docker-down elasticsearch logstash kibana clean

## help: Show available commands
help:
	@echo "=== BTP Project Commands ==="
	@echo ""
	@echo "Infrastructure:"
	@echo "  make start       - Start all services (dev)"
	@echo "  make stop        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - Follow all logs"
	@echo "  make logs:app    - Follow app logs only"
	@echo "  make logs:elk    - Follow ELK logs"
	@echo ""
	@echo "ELK Stack:"
	@echo "  make elasticsearch - Start Elasticsearch only"
	@echo "  make logstash      - Start Logstash only"
	@echo "  make kibana        - Start Kibana only"
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
	@echo "  make test:fast   - Run fast tests only"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean       - Clean logs and temporary files"
	@echo "  make backup      - Backup logs"
	@echo ""

## start: Start all services (PostgreSQL, Redis, ELK, API)
start:
	docker-compose up -d postgres redis elasticsearch logstash kibana
	@echo "Waiting for services to be healthy..."
	@docker-compose up -d api
	@echo ""
	@echo "=== Services Started ==="
	@echo "PostgreSQL:  http://localhost:5432"
	@echo "Redis:       http://localhost:6379"
	@echo "API:         http://localhost:4000"
	@echo "Elasticsearch: http://localhost:9200"
	@echo "Kibana:      http://localhost:5601"
	@echo ""
	@echo "ELK password: btp-elastic-2026!"
	@echo ""
	@echo "Logs location: ./logs/"
	@echo "  - app.log              (general app logs)"
	@echo "  - security.log         (security events)"
	@echo "  - elasticsearch/       (ES data)"
	@echo "  - kibana/              (Kibana data)"

## stop: Stop all services
stop:
	docker-compose down
	@echo "All services stopped."

## restart: Restart all services
restart:
	docker-compose down
	docker-compose up -d

## logs: Follow all container logs
logs:
	docker-compose logs -f

## logs:app: Follow API logs only
logs:app:
	docker-compose logs -f api
	@echo ""
	@echo "Or watch file logs:"
	@echo "  tail -f logs/app.log"
	@echo "  tail -f logs/security.log"

## logs:elk: Follow ELK stack logs
logs:elk:
	docker-compose logs -f elasticsearch logstash kibana

## elasticsearch: Start Elasticsearch only
elasticsearch:
	docker-compose up -d elasticsearch
	@echo "Elasticsearch starting at http://localhost:9200"
	@echo "Waiting for health check..."
	@until docker inspect --format='{{.State.Health.Status}}' btp-elasticsearch 2>/dev/null | grep -q "healthy"; do sleep 2; done
	@echo "Elasticsearch is healthy!"

## logstash: Start Logstash only
logstash:
	docker-compose up -d logstash
	@echo "Logstash starting at port 5044"

## kibana: Start Kibana only
kibana:
	docker-compose up -d kibana
	@echo "Kibana starting at http://localhost:5601"
	@echo "Waiting for Kibana..."
	@until docker inspect --format='{{.State.Health.Status}}' btp-kibana 2>/dev/null | grep -q "healthy"; do sleep 2; done
	@echo "Kibana is healthy! Access: http://localhost:5601"
	@echo "Login: elastic / btp-elastic-2026!"

## docker-up: Build and start everything
docker-up:
	docker-compose up --build -d
	@echo ""
	@echo "=== All Services Running ==="
	@docker-compose ps

## docker-down: Stop and remove everything
docker-down:
	docker-compose down -v
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

## test:fast: Run fast tests only
test:fast:
	bun test src/libs/ test/api/pentest-full.test.ts test/api/security-events.test.ts

## clean: Clean logs and temp files
clean:
	@echo "Cleaning logs..."
	@rm -f logs/app.log logs/security.log
	@rm -f logs/elasticsearch/*
	@rm -f logs/kibana/*
	@echo "Clean complete."

## backup: Backup logs
backup:
	@mkdir -p logs/backup
	@timestamp=$$(date +%Y%m%d-%H%M%S)
	@cp logs/app.log logs/backup/app-$${timestamp}.log 2>/dev/null || true
	@cp logs/security.log logs/backup/security-$${timestamp}.log 2>/dev/null || true
	@echo "Logs backed up to logs/backup/"
