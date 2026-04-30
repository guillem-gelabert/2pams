# Coding Conventions

**Analysis Date:** 2026-04-30

## Naming Patterns

**Files:**
- `kebab-case.ts` for source modules: `src/index.ts`, `src/security-headers.ts`
- `kebab-case.spec.ts` for tests: `tests/e2e/proxy-elpais.spec.ts`, `tests/e2e-2-domains/two-domain-proxy.spec.ts`
- One responsibility per file; barrel files are not used.

**Functions:**
- `camelCase` for all function declarations and methods.
  - Module-level helpers: `isSafeUrl()`, `runProxy()`, `isRailwayRuntime()`, `shouldApplyAppSecurityHeaders()` in `src/index.ts` and `src/security-headers.ts`.
  - Exported functions follow the same convention: `useAppSecurityHeadersIfNeeded(app, role)` in `src/security-headers.ts`.
- Predicates start with `is*` / `should*` and return `boolean`.
- Async functions are explicitly typed `Promise<T>` (e.g. `runProxy(...): Promise<void>`).

**Variables:**
- Local variables and parameters: `camelCase` (`url`, `headers`, `site`, `body`, `root`, `metaTag`).
- `const` is the default; `let` only where reassignment is required (e.g. `let url: URL;` then assigned inside a `try`/`catch` for error narrowing in `src/index.ts`).
- `var` is forbidden (`no-var: 'error'` in `.eslintrc.js`).

**Types:**
- `PascalCase` for type aliases and interfaces: `type Role = 'shell' | 'content' | 'monolith';` (defined in both `src/index.ts` and `src/security-headers.ts`).
- Express types are imported by name from `express`, with `Response` aliased to `ExpressResponse` in `src/index.ts` to avoid clashing with the global `fetch` `Response`.

**Constants:**
- Module-level configuration values use `UPPER_SNAKE_CASE`:
  - `BLOCKED_IP_PATTERNS` (regex array of private/internal IP ranges) — `src/index.ts`.
  - `CONTENT_ORIGIN`, `ROLE`, `PORT`, `DEPLOYMENT_TIMESTAMP` — `src/index.ts`.
  - `PERMISSIONS_POLICY`, `BASE_HEADERS`, `SHELL_CSP`, `CONTENT_CSP`, `MONOLITH_CSP` — `src/security-headers.ts`.
- Constants that are object literals use `as const` to lock literal types (e.g. `BASE_HEADERS` in `src/security-headers.ts`).

## Code Style

**Formatting:**
- Tool: Prettier 3.x (`.prettierrc`).
- Settings (these are the project's source of truth — match them when adding code):
  - `semi: true` — always emit semicolons.
  - `singleQuote: true` — single quotes for JS/TS strings.
  - `jsxSingleQuote: false` — double quotes inside JSX (currently unused, but locked for future).
  - `trailingComma: 'es5'` — trailing commas where ES5 allows.
  - `printWidth: 80`.
  - `tabWidth: 2`, `useTabs: false`.
  - `bracketSpacing: true`, `bracketSameLine: false`.
  - `arrowParens: 'avoid'` — single-arg arrow functions are written as `x => ...`, not `(x) => ...`.
  - `endOfLine: 'lf'`.
  - `quoteProps: 'as-needed'`.
- Run `npm run format` to write, `npm run format:check` to verify.

**Linting:**
- Tool: ESLint 8.x with `@typescript-eslint` parser/plugin and Prettier integration (`.eslintrc.js`).
- Extends: `eslint:recommended`, `prettier`.
- Notable rules:
  - `prettier/prettier: 'error'` — formatting violations fail lint.
  - `@typescript-eslint/no-unused-vars: ['warn', { argsIgnorePattern: '^_' }]` — prefix unused params with `_` (e.g. `(_req: Request, res: Response)` in `src/security-headers.ts`).
  - `@typescript-eslint/no-explicit-any: 'warn'`.
  - `@typescript-eslint/no-var-requires: 'error'` — use ES `import`, never `require`.
  - `prefer-const: 'error'`, `no-var: 'error'`.
  - `prefer-template: 'error'` — template literals over `+` concatenation.
  - `object-shorthand: 'error'`.
  - `no-console: 'warn'` — `console.info` is used in `src/index.ts` startup logs (warning is accepted there); production logs go through `H.log` from `@highlight-run/node`.
  - `no-debugger: 'error'`.
- Ignored: `dist/`, `node_modules/`, `*.js`. Lint command targets `.ts` only: `eslint . --ext .ts`.

## Import Organization

**Order (observed in `src/index.ts`):**
1. Node built-ins: `import dns from 'dns/promises';`
2. Third-party packages: `express`, `dotenv`, `@highlight-run/node`, `node-html-parser`.
3. Local relative imports last: `import { useAppSecurityHeadersIfNeeded } from './security-headers';`

**Type-only imports:**
- Use `import type` when only types are needed (e.g. `import type { Express, NextFunction, Request, Response } from 'express';` in `src/security-headers.ts`).
- Mix value+type imports on a single line only when both are used (`import express, { Request, Response as ExpressResponse } from 'express';` in `src/index.ts`).

**Path Aliases:**
- None configured. All non-package imports are relative (`./security-headers`).

## Error Handling

**Patterns:**
- **Early returns with HTTP status codes — never throw inside request handlers.**
  - `404` → URL parse failure or missing path param: `res.sendStatus(404);` in `src/index.ts`.
  - `403` → SSRF guard rejection or 3xx upstream response: `res.sendStatus(403);`.
  - `502` → upstream `fetch` failure (network error, DNS, etc.): `res.sendStatus(502);`.
- `try`/`catch` wraps **only** the operation that can fail; the `catch` block emits the status and returns. Do not nest broad `try`/`catch` around a whole handler.
- `try { ... } catch { ... }` (no error binding) is the norm when the error object isn't logged. If logging is added, use `catch (err)` with `H.consumeError(err)` rather than `console.error`.
- Init-time invariants throw at module load (fail fast, before `app.listen`):
  ```ts
  if (ROLE === 'shell' && !CONTENT_ORIGIN) {
    throw new Error('ROLE=shell requires CONTENT_ORIGIN env var');
  }
  ```
  See `src/index.ts`.
- Express error middleware is `Handlers.errorHandler(highlightConfig)` from `@highlight-run/node`, registered last (`src/index.ts`).

**Defensive parsing:**
- `req.params[0]` (the wildcard from `/http*`) is checked for `undefined` before use, because `noUncheckedIndexedAccess: true` makes that union explicit:
  ```ts
  const p0 = req.params[0];
  if (p0 === undefined) {
    return res.sendStatus(404);
  }
  ```
  See `src/index.ts`.
- URL construction is wrapped in `try`/`catch` to convert `URL` constructor exceptions into `404`s.

## Logging

**Framework:** `@highlight-run/node` for application/error logs (`H.log`, `H.init`, `Handlers.middleware`, `Handlers.errorHandler`).

**Patterns:**
- `console.info` is used **only** for one-time startup banners in `app.listen` (`src/index.ts`). New runtime logs should use `H.log('http', '...')` or equivalent — `no-console` is a lint warning, not an error, so `console.*` slips through but is discouraged.
- Errors during request handling are not currently logged (the `catch {}` blocks swallow them and return a status). If you add logging, route through Highlight, not `console`.

## Comments

**When to comment (observed style):**
- Comments document **non-obvious intent, security model, or trade-offs** — never restate what the code does.
- Block JSDoc (`/** ... */`) on exported APIs and on module-level constants whose purpose isn't obvious from the name:
  - The `Role` docblock in `src/index.ts` explaining `monolith`/`shell`/`content` semantics.
  - `useAppSecurityHeadersIfNeeded`, `isRailwayRuntime`, `BASE_HEADERS`, `SHELL_CSP`, `CONTENT_CSP`, `MONOLITH_CSP` in `src/security-headers.ts`.
- Single-line `//` comments mark **deliberate omissions or security-relevant decisions**:
  - The "iframe-less variant" warning in `src/index.ts` explaining why `<script>` and `on*` handlers are intentionally not stripped.
  - The "Defense-in-depth" note above the `javascript:` pseudo-URL stripping loop.
  - `// SSRF: block private/internal IP ranges` above `BLOCKED_IP_PATTERNS`.
- No banner comments, no "// imports" / "// constants" section dividers, no narration of what the next line does.

**JSDoc usage:**
- Used to attach **prose context** to exported symbols and security-critical constants. No `@param` / `@returns` tags — TypeScript types carry that information.

## Function Design

**Size:** Functions stay focused on a single responsibility. `runProxy` (`src/index.ts`) is the largest at ~75 lines and is purposefully linear (URL parse → SSRF check → fetch → DOM rewrite → respond).

**Parameters:**
- Positional parameters are preferred when there are ≤3 (e.g. `runProxy(res, param0, log)`).
- Express-style handler arity is preserved: `(req, res)` or `(req, res, next)`.
- Unused parameters are prefixed with `_` to satisfy the lint rule (`(_req: Request, res: Response, next: NextFunction)`).

**Return values:**
- Async handlers return `Promise<void>`; they `return res.sendStatus(...)` or `return res.redirect(...)` purely for early-exit control flow, not because the caller consumes the return value.
- Pure helpers return narrow types: `Promise<boolean>` for `isSafeUrl`, `boolean` for `isRailwayRuntime` / `shouldApplyAppSecurityHeaders`.

**Functions over classes:**
- The codebase has zero classes. All logic is plain functions and module-level constants. Prefer this style for new code.

## Module Design

**Exports:**
- Named exports only (`export function useAppSecurityHeadersIfNeeded`). No `export default`.
- `src/index.ts` is the entry point and exports nothing — it has top-level side effects (`dotenv.config()`, `H.init`, `app.listen`).

**Barrel files:** Not used. Import directly from the implementing module.

## TypeScript Strict Mode Rules

`tsconfig.json` enables the full strict suite plus extras. New code must satisfy all of these:

- `strict: true` — implies `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `alwaysStrict`, `noImplicitAny`, `noImplicitThis`, `useUnknownInCatchVariables`.
- `noImplicitReturns: true` — every code path must return.
- `noImplicitOverride: true` — `override` keyword required when overriding (no classes today, but enforced).
- `exactOptionalPropertyTypes: true` — `{ x?: T }` does **not** allow `{ x: undefined }`. Omit the key entirely or widen the type to `T | undefined`.
- `noPropertyAccessFromIndexSignature: true` — access env vars as `process.env['ROLE']`, **not** `process.env.ROLE`. This is why `src/index.ts` uses bracket notation everywhere for `process.env`.
- `noUncheckedIndexedAccess: true` — indexed reads return `T | undefined`. Always narrow before use (see `req.params[0]` check above).
- `forceConsistentCasingInFileNames: true`.
- `esModuleInterop: true` — default-import CommonJS modules normally (`import express from 'express'`).
- `module: 'commonjs'`, `target: 'ES2022'`, `lib: ['ES2022']`. Native `fetch` is available without polyfills.
- `noUnusedLocals: false`, `noUnusedParameters: false` — TS itself does not flag these; ESLint's `no-unused-vars` does, with the `^_` ignore pattern.

**Test files** (`**/*.test.ts`) are excluded from the TS compile, but Playwright `*.spec.ts` files in `tests/` are not under `src/` and so are also outside the `include` glob — they're type-checked by Playwright's own `ts-node` pipeline at run time.

## Configuration via Environment

- All runtime configuration is read from `process.env['<NAME>']` at module load (never inside hot paths).
- Required vs. optional is enforced by explicit checks at startup (see the `ROLE === 'shell' && !CONTENT_ORIGIN` guard in `src/index.ts`).
- `dotenv.config()` is called once at the top of `src/index.ts`, before any env var is read.
- `.env.example` documents the contract; `.env` is git-ignored. Do **not** read `.env` from any code other than `dotenv`.

---

*Convention analysis: 2026-04-30*
