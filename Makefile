# Local commands (B1). Services run directly; Docker is not installed on this machine.
.PHONY: setup dev dev-check migrate seed lint typecheck test-unit test-integration test test-clean golden parity

setup:        ## install, create role payclock_app, write .env.local/.env.test, migrate dev
	npm install
	npm run db:bootstrap
	npm run db:migrate

dev:          ## start API (8104) and worker; prints "ready" when /readyz is healthy
	npm run dev

dev-check:    ## start, wait for ready, stop (exit code = readiness)
	npx tsx scripts/dev.ts --check

migrate:
	npm run db:migrate

seed:
	npx tsx scripts/seed-synthetic.ts

lint:
	npm run lint

typecheck:
	npm run typecheck

test-unit:
	npm run test:unit

test-integration:  ## drops and re-migrates payclock_test first (global setup)
	npm run test:integration

test: lint typecheck test-unit test-integration

golden:
	npm run golden-verify

parity:
	npx tsx scripts/orm-parity.ts --test
