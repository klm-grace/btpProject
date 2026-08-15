# ═══════════════════════════════════════════════════════════════
# Makefile — BTP Project API
# ═══════════════════════════════════════════════════════════════

.PHONY: help dev build start test test-integration test-pentest clean
.PHONY: docker db-migrate db-seed typecheck

help:
	@echo "BTP Project API"
	@echo ""
	@echo "Commands:"
	@echo "  make dev             Dev server"
	@echo "  make test            All tests"
	@echo "  make build           Build production"
	@echo "  make start           Start production"
	@echo "  make docker          Docker build"
	@echo "  make clean           Cleanup"

dev:
	bun run api:dev

test:
	bun test

test-integration:
	bun test test/api/ --timeout 15000

test-pentest:
	bun test test/api/pentest-full.test.ts

typecheck:
	bunx tsc --noEmit

build:
	bash scripts/build.sh

start:
	bash scripts/start-prod.sh

docker:
	bash scripts/build-docker.sh

db-migrate:
	bun run db:migrate

db-seed:
	bun run db:seed

clean:
	rm -rf dist/
	rm -rf logs/*.log
