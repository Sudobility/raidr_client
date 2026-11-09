# raidr_client

TypeScript client and TanStack Query hooks for the raidr API. Published as
`@sudobility/raidr_client` (BUSL-1.1). It is a library layer with no runnable
app: `RaidrClient` moves raidr_api wire types over HTTP and the `useRaidr*`
hooks cache them; anything derived (paging, snippets, error classification)
belongs in the `raidr_lib` layer above it.

## Install

The `@sudobility` scope is hosted on **GitHub Packages**, not the public npm
registry, so consumers need an `.npmrc` that points the scope at it and
supplies a GitHub token with `read:packages`:

```
@sudobility:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
bun add @sudobility/raidr_client
```

Install the peer dependencies yourself: `@sudobility/di`,
`@sudobility/raidr_types`, `@sudobility/types`, `@tanstack/react-query` (>=5)
and `react` (>=18).

## Usage

```ts
import { createRaidrClient, useRaidrMcps } from '@sudobility/raidr_client';

const client = createRaidrClient(networkClient, 'https://api.raidr.app');
const { data } = await client.getMcps({ q: 'example' });
```

Every hook takes `(networkClient, baseUrl, ...)` so web, native and tests share
one code path; the `NetworkClient` comes from `@sudobility/di`. Reads are
public. Mutations take the shared write key as `token` and send it as
`X-API-Key`.

| Export | Purpose |
| --- | --- |
| `RaidrClient` | `getMcps`, `getMcp`, `getSkills`, `getSkill`, `getSkillByName`, `getSites`, `getSite`, `getApis`, `getApiSummary`, `getApiDoc`, `getApiFlow`, `executeApi`, `upsert*`, `delete*`, `skillMarkdownUrl`, `mcpProxyUrl` |
| `useRaidrMcps` / `useRaidrMcp` | catalog and detail queries |
| `useRaidrSkills` / `useRaidrSkill` | same for skills |
| `useRaidrSites` / `useRaidrSite` | same for sites, with an `apiHost` filter |
| `useRaidrApis` / `useRaidrApiSummary` / `useRaidrApiDoc` / `useRaidrApiFlow` | API docs: list, public summary, full doc and flow links (doc and flow need a signed-in user or entity key) |
| `useRaidrExecuteApi` | run one endpoint through raidr_api's execute proxy (mutation) |
| `useRaidrSkillByName` | one skill by its slug |
| `queryKeys`, `STALE_TIMES` | cache keys rooted at `["raidr"]` |

The package also exposes a `./network` subpath (`@sudobility/raidr_client/network`)
that is the client only, without the React hooks.

## Development

Bun only. Clone, then:

```bash
bun install          # restores node_modules (GitHub Packages auth required)
bun run verify       # lint -> typecheck -> test:unit -> build (the full gate)
```

Individual scripts:

| Command | Does |
| --- | --- |
| `bun run lint` / `lint:fix` | ESLint on `src` (Prettier runs as an ESLint rule) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test:unit` (= `test:run`) | Vitest once (happy-dom); `test:watch`, `test:coverage` also exist |
| `bun run build` | `tsc -p tsconfig.build.json` -> `dist/`, then an ESM-import fixup |
| `bun run format` / `format:check` | Prettier over `src` |

Source lives in `src/` (`network/` for the client, `hooks/` for the query
hooks); tests are under `__tests__/` and use `MockNetworkClient` from
`@sudobility/di/mocks`. A push to `main` or `develop` runs CI and publishes to
GitHub Packages when the version is new. See `CLAUDE.md` for architecture,
conventions and the endpoint map.
