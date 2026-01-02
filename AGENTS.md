# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds the Cloudflare Worker code, with most logic in `src/lib/` (reference and HIG fetch/render helpers) and the entrypoint in `src/index.ts`.
- `tests/` contains Vitest unit/integration tests plus fixtures under `tests/fixtures/` and mocks under `tests/mocks/`.
- `public/` includes static assets served by the worker (icons, `index.html`, `llms.txt`).
- Root config files include `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, and `biome.json`.

## Build, Test, and Development Commands

- `npm run dev` starts the local Worker via Wrangler.
- `npm run deploy` deploys to Cloudflare Workers with minification.
- `npm run cf-typegen` regenerates Cloudflare bindings in `worker-configuration.d.ts` after changing `wrangler.jsonc`.
- `npm run test`, `npm run test:run`, `npm run test:ui` run Vitest (watch, single run, or UI).
- `npm run format`, `npm run lint`, `npm run check` run Biome formatting/linting (use `check` before PRs).

## Coding Style & Naming Conventions

- TypeScript modules use 2-space indentation and 100-char line width (see `biome.json`).
- Double quotes and semicolon-less style are enforced by Biome.
- Files follow `*.ts` and tests use `*.test.ts`.
- Prefer explicit, descriptive names for HIG and reference helpers (e.g., `src/lib/hig/render.ts`).

## Testing Guidelines

- Tests use Vitest with the Cloudflare Workers pool (`vitest.config.ts`).
- Keep fixtures in `tests/fixtures/` and test-only helpers in `tests/mocks/`.
- Name new tests `something.test.ts` and cover URL parsing + rendering changes.

## Commit & Pull Request Guidelines

- Recent commits use short, imperative, sentence-case subjects and often include an issue/PR number (e.g., “Fix rendering of … (#19)”).
- PRs should include a clear summary, test results (or rationale if not run), and any config changes (e.g., `wrangler.jsonc`).

## Configuration Notes

- Update `wrangler.jsonc` for bindings and re-run `npm run cf-typegen`.
- Public assets live in `public/` and should be referenced directly by filename when served.
