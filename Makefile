# ═══════════════════════════════════════════════════════════════
# Makefile — BTP Project API
# ═══════════════════════════════════════════════════════════════

.PHONY: help dev build start test clean docker docker-run

## Afficher cette aide
help:
	@echo "BTP Project API — Commands"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up      Démarre PostgreSQL + Redis"
	@echo "  make infra-down    Arrête les conteneurs"
	@echo ""
	@echo "Développement:"
	@echo "  make dev           Lance le serveur en dev mode"
	@echo "  make typecheck     Vérifie les types TypeScript"
	@echo ""
	@echo "Tests:"
	@echo "  make test          Lance tous les tests"
	@echo "  make test:integration  Lance les tests API"
	@echo "  make test:pentest  Lance les tests de sécurité"
	@echo ""
	@echo "Build:"
	@echo "  make build         Build production (tests + compilation)"
	@echo "  make start         Démarre le serveur production"
	@echo "  make docker        Build l'image Docker"
	@echo "  make docker-run    Démarre le conteneur Docker"
	@echo ""
	@echo "Database:"
	@echo "  make db:migrate    Applique les migrations"
	@echo "  make db:seed       Seed la base de données"
	@echo "  make db:prepare    migrate + seed"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         Nettoie les fichiers de build"

## Démarre les services infrastructure
infra-up:
	bun run infra:up

## Arrête les services infrastructure
infra-down:
	bun run infra:down
	bun run infra:down --remove-orphans

## Lance le serveur en développement
dev:
	bun run api:dev

## Vérification des types TypeScript
typecheck:
	bunx tsc --noEmit

## Lance tous les tests
test:
	bun test

## Lance les tests d'intégration API
test:integration:
	bun test test/api/ --timeout 15000

## Lance les tests de sécurité (pentest)
test:pentest:
	bun test test/api/pentest-full.test.ts

## Build production complet (tests + compilation)
build:
	bash scripts/build.sh

## Démarre le serveur en production
start:
	bash scripts/start-prod.sh

## Build l'image Docker
docker:
	bash scripts/build-docker.sh

## Démarre le conteneur Docker
docker-run:
	bun run docker:run

## Applique les migrations
db:migrate:
	bun run db:migrate

## Seed la base de données
db:seed:
	bun run db:seed

## Prépare la base (migrate + seed)
db:prepare:
	bun run db:migrate
	bun run db:seed

## Nettoie les fichiers de build
clean:
	rm -rf dist/
	rm -rf logs/*.log
	find . -name "*.log" -not -path "./.git/*" -delete 2>/dev/null || true
