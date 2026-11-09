# CLAUDE.md — raidr_client

> **Git policy — never auto-commit or auto-push.** Leave your work in the working tree.
> Run `git commit`, `git push`, `gh pr create`, or `push_all.sh` **only when the user
> explicitly asks in that turn**. Approval for an earlier change does not carry forward, and
> finishing a task is not permission to commit it.

HTTP client + TanStack Query hooks for `raidr_api`. Published as
`@sudobility/raidr_client` on **GitHub Packages** (not public npm). Bun only.
Mirrors `sudojo_client`.

## Layer position

```
raidr_types  (wire types, header names, path helpers)
     │
raidr_client ◄── this repo: RaidrClient (HTTP) + useRaidr* query hooks
     │
raidr_lib    (derived state: catalogs, detail classification, snippets)
     │
raidr_app    (web UI, Cloudflare Pages)
```

| Item | Value |
| --- | --- |
| Package | `@sudobility/raidr_client`, BUSL-1.1, `publishConfig.access: public` |
| Registry | GitHub Packages (`.npmrc`: `@sudobility:registry=https://npm.pkg.github.com`) |
| Version | see `package.json` (currently `0.1.20`) |
| Entry points | `.` (client + hooks) and `./network` (client only), per `exports` |
| Runtime dep | `@sudobility/raidr_types` (^0.1.19) |
| Peer deps | `@sudobility/di`, `@sudobility/types`, `@tanstack/react-query` >=5, `react` >=18 |
| Consumers | `raidr_lib`, then `raidr_app` (`HomePage` also calls the hooks directly) |

## Rules

- `src/network/raidr-client.ts`: `createApiConfig` endpoint map and one private
  `request<T>`; the `NetworkClient` is injected, never `fetch` directly. Methods
  return `response.data` cast to `T` — nothing is validated at runtime.
- `src/hooks/`: one file per resource; every hook signature is
  `(networkClient, baseUrl, ...params, options?)`. Mutations invalidate the list
  key and the affected detail key from `query-keys.ts` (delete hooks *remove*
  the detail key rather than invalidate it).
- Tests use `MockNetworkClient` from `@sudobility/di/mocks` and assert URL,
  method, `X-API-Key` presence, and query encoding.
- Types come only from `@sudobility/raidr_types`; never redefine a wire type.

## Commands

All verified passing on 2026-11-08 (requires `bun install` first — GitHub
Packages auth needed to restore `node_modules`).

| Command | What it does | Result |
| --- | --- | --- |
| `bun run verify` | lint → typecheck → test:unit → build | exit 0 |
| `bun run check-all` | lint → typecheck → test:unit | exit 0 |
| `bun run lint` | ESLint 10 on `src`; `prettier/prettier` is an error | exit 0 |
| `bun run typecheck` | `tsc --noEmit` (tsconfig excludes `*.test.ts`) | exit 0 |
| `bun run test:unit` (= `test:run`) | Vitest once, happy-dom | 2 files, 12 tests pass |
| `bun run test:coverage` | Vitest + v8 → `coverage/` (gitignored) | no threshold |
| `bun run build` | `tsc -p tsconfig.build.json` → `dist/`, then `scripts/fix-esm-imports.mjs` | exit 0 |
| `bun run format:check` | Prettier on `src/**/*.ts` | exit 0 |
| `format`, `lint:fix`, `*:watch` | rewrite files / watch modes | not run here |

Single file: `bun run test:unit src/network/__tests__/raidr-client.test.ts`.

## File map

```
src/
├── index.ts                      public API: client, every hook, queryKeys, STALE_TIMES
├── network/
│   ├── index.ts                  `./network` subpath barrel
│   ├── raidr-client.ts           RaidrClient, createRaidrClient, endpoint map, withQuery
│   └── __tests__/raidr-client.test.ts
└── hooks/
    ├── index.ts                  barrel
    ├── query-keys.ts             queryKeys.raidr.* (root ["raidr"])
    ├── query-config.ts           STALE_TIMES
    ├── use-raidr-client.ts       useRaidrClient (memoized RaidrClient)
    ├── use-raidr-health.ts       useRaidrHealth
    ├── use-raidr-mcps.ts         useRaidrMcps / Mcp / McpSummary / UpsertMcp / DeleteMcp
    ├── use-raidr-skills.ts       useRaidrSkills / Skill / UpsertSkill / DeleteSkill
    ├── use-raidr-sites.ts        useRaidrSites / Site / UpsertSite
    ├── use-raidr-crawl.ts        useRaidrSiteMcps / SiteSkills / CrawlJobs / EnqueueCrawlJobs
    ├── use-raidr-apis.ts         useRaidrApis / ApiSummary / ApiDoc / ApiFlow / ExecuteApi, useRaidrSkillByName
    ├── use-raidr-invalidation.ts useRaidrInvalidation (invalidates ["raidr"])
    └── __tests__/query-keys.test.ts
scripts/fix-esm-imports.mjs       post-build: rewrites relative specifiers to explicit .js paths
.github/workflows/ci-cd.yml       johnqh/workflows unified-cicd.yml, publish-target: github
```

## Endpoints & auth (`createApiConfig`)

Full method list is in `raidr-client.ts`; what matters here is the auth model:

- **Reads are public**; mutations take the shared write key as the first arg and
  send it as `X-API-Key` (`RAIDR_API_KEY_HEADER`).
- Three reads need a credential anyway: `getMcp`, `getApiDoc`, `getApiFlow`
  (plus `executeApi`). In the browser the Firebase-aware NetworkClient adds the
  user's token; a script passes an entity key (`raidr_…`) as `apiKey`, also sent
  as `X-API-Key`. Anonymous → 401; anonymous callers use the public `summary`
  endpoints (`getMcpSummary`, `getApiSummary`) instead.
- `executeApi` body carries the upstream `userToken`/`apiKey`; raidr_api never
  stores them, and the hook caches nothing (every run is a fresh call).
- Every path param is `encodeURIComponent`-ed. Sites are keyed by **full origin**
  (`https://www.example.com`); a test pins the encoding. `withQuery` drops
  `undefined` and `""`, so an empty search sends no `q`. Trailing slashes on the
  base URL are stripped.
- Entity/member/invitation/entity-API-key endpoints are **not** here; the app
  uses `@sudobility/entity_client` against the same base URL.
- `skillMarkdownUrl` and `mcpProxyUrl` build URLs only (no request).

## Conventions

**Hook signatures.** Queries: `(networkClient, baseUrl, params | id, options?)`,
`options` = `Omit<UseQueryOptions<T>, "queryKey" | "queryFn">`, spread *after*
the defaults so callers can override `staleTime`/`retry`. Mutations:
`(networkClient, baseUrl)` with variables `{ token, apiHost | origin, data? }`
(write key is named `token`) — except `useRaidrExecuteApi`, whose variables are
`{ apiHost, data, apiKey? }`. Every hook builds its client through
`useRaidrClient`, memoized on `[networkClient, baseUrl]`, so pass a stable
NetworkClient.

**Query keys** (`query-keys.ts`) all sit under `["raidr"]`: list keys
(`mcps`/`skills`/`sites`/`apis`) take an optional filter; detail keys
(`mcp`/`skill`/`site`/`apiDoc`/`apiFlow`/`apiSummary`/`mcpSummary`/`skillByName`)
take the id. `all()` = `["raidr"]` is what `useRaidrInvalidation` clears.

**Stale times** (`STALE_TIMES`): `HEALTH` 1 min, `CATALOG` 5 min, `DETAIL` 10
min. The catalog only changes when a crawl publishes.

**Enabled / retry.** `useRaidrMcp`, `useRaidrSkill`, `useRaidrSite`,
`useRaidrApiSummary`, `useRaidrApiDoc`, `useRaidrApiFlow`, `useRaidrSkillByName`
set `enabled: id.length > 0 && (options?.enabled ?? true)` after the spread, so
an empty route param never fires. `useRaidrSkill` defaults `retry: false` (a
missing skill is normal for an MCP). Pass `enabled: false` to
`useRaidrApiDoc`/`useRaidrApiFlow` while signed out (they 401).

**Error handling.** The client catches nothing. The web NetworkClient throws
`NetworkError` (`@sudobility/types`) whose `.status` is the HTTP status (`0` when
unreachable, `408` on timeout); the rejection lands in the query's `error`.
raidr_lib's `isNotFoundError`/`detailState` turn a 404 into "not found".

## Adding an endpoint

1. `raidr_types`: add the request/response types (never define them here).
2. Here: path in `createApiConfig().ENDPOINTS` → `RaidrClient` method calling
   `this.request` → key in `queryKeys.raidr` → hook in the matching
   `use-raidr-*.ts`.
3. Export from `src/hooks/index.ts` **and** `src/index.ts`.
4. Test in `src/network/__tests__/` with `MockNetworkClient`
   (`setMockResponse(url, { data }, method)`, then `getRequests().at(-1)`).
5. `bun run verify`, then wrap in raidr_lib and render in raidr_app.

## Release

- Family release runs from `raidr_app/scripts/push_all.sh` in dependency order
  (`raidr_types → raidr_processor → raidr_client → raidr_lib → …`); it bumps the
  patch, commits and pushes per repo. Never run it unasked.
- A push to `main` or `develop` runs `.github/workflows/ci-cd.yml` →
  `johnqh/workflows` `unified-cicd.yml` (typecheck, lint, test:unit, build) and
  publishes to **GitHub Packages** (`publish-target: github`) only when this
  version is not already published.
- 0.x caret ranges: `^0.1.0` accepts any `0.1.x`, so a patch release reaches
  raidr_lib/raidr_app on their next install without a range change.

## Gotchas

- **The ESM fixup is part of the build.** `tsc` runs under
  `moduleResolution: "bundler"` and emits extensionless relative imports that
  Node's native ESM loader rejects; `scripts/fix-esm-imports.mjs` rewrites them
  to explicit `./x.js` / `./dir/index.js`. `bun run build` runs it; raw `tsc`
  alone leaves `dist/` unresolvable under Node ESM.
- **JSDoc is stripped from the published `.d.ts`** (`removeComments: true` in
  `tsconfig.json`, not overridden by `tsconfig.build.json`). Comments help
  in-repo readers only.
- No site delete hook, although `RaidrClient.deleteSite` exists; `createMcp`,
  `createSkill`, `createSite` have no hooks either.
- Lint runs Prettier as an ESLint rule (double quotes, trailing commas `all`,
  width 80), so a badly wrapped comment fails `bun run lint`.
- Tests live in `__tests__/`, excluded from `tsconfig.json` and the build; only
  Vitest and ESLint see them.
