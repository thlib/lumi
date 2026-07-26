# Common development commands for Lumi.
# Every target delegates to the package scripts, so `make` and `pnpm run`
# stay interchangeable. Run `make` on its own to list targets.

.DEFAULT_GOAL := help

PNPM ?= pnpm
BROWSERS ?= chromium firefox
PORT ?= 8008

.PHONY: help install build types bundle spa size lint test test-browser \
	test-package browsers check bench spa-bench serve clean

help: ## List the available targets
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\n"} \
		/^[a-zA-Z][a-zA-Z-]*:.*##/ {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}' \
		$(MAKEFILE_LIST)

install: ## Install dependencies from the lockfile
	$(PNPM) install --frozen-lockfile

build: ## Emit declarations and the browser bundle into dist/
	$(PNPM) run build

types: ## Emit only the TypeScript declarations
	$(PNPM) run build:types

bundle: ## Emit only the minified browser bundle
	$(PNPM) run build:bundle

spa: ## Build the SPA example into examples/spa/dist
	$(PNPM) run build:spa

size: bundle ## Report the browser bundle size, raw and gzipped
	@printf 'dist/lumi.js  %s bytes raw  %s bytes gzipped\n' \
		"$$(wc -c < dist/lumi.js)" "$$(gzip -9 -c dist/lumi.js | wc -c)"

lint: ## Type-check sources, tests, and the declaration build
	$(PNPM) run lint

test: ## Run the Node test suite
	$(PNPM) test

test-browser: ## Run the Playwright suite (run `make browsers` first)
	$(PNPM) run test:browser $(addprefix --project=,$(BROWSERS))

test-package: ## Pack a tarball and verify its published surface
	$(PNPM) run test:package

browsers: ## Download the Playwright browsers
	$(PNPM) exec playwright install $(BROWSERS)

check: lint test test-package test-browser ## Run everything CI runs

bench: ## Run the Node rendering baseline
	$(PNPM) run benchmark

spa-bench: ## Run the SPA comparison benchmark
	$(PNPM) run benchmark:spa

serve: ## Serve the repository on port 8008 to browse examples/
	@echo "Examples: http://localhost:$(PORT)/examples/counter/"
	python3 -m http.server $(PORT)

clean: ## Remove build output
	$(PNPM) run clean
