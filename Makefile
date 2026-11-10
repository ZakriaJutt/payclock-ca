# Local commands (B1). All code lives in workspace/; the repository root keeps only the ten
# planning documents, .gitignore and this Makefile. Services run directly (no Docker here).
W := cd workspace &&
.PHONY: setup dev dev-check migrate seed lint typecheck test-unit test-integration test golden parity

setup:        ## install, create role payclock_app, write .env.local/.env.test, migrate dev
	$(W) npm install
	$(W) npm run db:bootstrap
	$(W) npm run db:migrate

dev:          ## start API (8104) and worker; prints "ready" when /readyz is healthy
	$(W) npm run dev

dev-check:    ## start, wait for ready, stop (exit code = readiness)
	$(W) npx tsx scripts/dev.ts --check

migrate:
	$(W) npm run db:migrate

seed:
	$(W) npx tsx scripts/seed-synthetic.ts

lint:
	$(W) npm run lint

typecheck:
	$(W) npm run typecheck

test-unit:
	$(W) npm run test:unit

test-integration:  ## drops and re-migrates payclock_test first (global setup)
	$(W) npm run test:integration

test: lint typecheck test-unit test-integration

golden:
	$(W) npm run golden-verify

parity:
	$(W) npx tsx scripts/orm-parity.ts --test
