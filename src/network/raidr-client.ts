/**
 * HTTP client for raidr_api.
 *
 * Every request goes through the injected `NetworkClient` (never `fetch`), so
 * the same class runs in the web app, React Native and tests with
 * `MockNetworkClient`. Errors are not caught here: the NetworkClient throws
 * (the web one from `@sudobility/di` throws `NetworkError` with the HTTP
 * status, 0 when the API is unreachable, 408 on timeout) and the rejection
 * reaches the caller or TanStack Query unchanged.
 */
import type {
  BaseResponse,
  NetworkClient,
  PaginatedResponse,
} from "@sudobility/types";
import {
  type ApiDocRow,
  type ApiDocSummary,
  type ApiExecuteRequest,
  type ApiExecuteResult,
  type ApiFlow,
  type CrawlJob,
  type CrawlJobEnqueueRequest,
  type CrawlJobEnqueueResult,
  type CrawlJobListQueryParams,
  type HealthCheckData,
  type ListQueryParams,
  type Mcp,
  MCP_PROXY_PATH,
  type McpSummary,
  type McpUpsertRequest,
  RAIDR_API_KEY_HEADER,
  type Site,
  type SiteCreateRequest,
  type SiteListQueryParams,
  type SiteUpsertRequest,
  type Skill,
  type SkillCreateRequest,
  type SkillSummary,
  type SkillUpsertRequest,
} from "@sudobility/raidr_types";

// =============================================================================
// API configuration
// =============================================================================

/**
 * Endpoint map for one base URL. Trailing slashes are stripped so
 * `${BASE_URL}${path}` never doubles a slash. Every caller-supplied path
 * segment is `encodeURIComponent`-ed: a site key is a full origin such as
 * `https://www.example.com`, whose `:` and `/` would otherwise split the path.
 */
const createApiConfig = (baseUrl: string) => ({
  BASE_URL: baseUrl.replace(/\/+$/, ""),
  ENDPOINTS: {
    HEALTH: "/",
    MCPS: "/api/v1/mcps",
    MCP: (apiHost: string) => `/api/v1/mcps/${encodeURIComponent(apiHost)}`,
    MCP_SUMMARY: (apiHost: string) =>
      `/api/v1/mcps/${encodeURIComponent(apiHost)}/summary`,
    APIS: "/api/v1/apis",
    API: (apiHost: string) => `/api/v1/apis/${encodeURIComponent(apiHost)}`,
    API_SUMMARY: (apiHost: string) =>
      `/api/v1/apis/${encodeURIComponent(apiHost)}/summary`,
    API_FLOW: (apiHost: string) =>
      `/api/v1/apis/${encodeURIComponent(apiHost)}/flow`,
    API_EXECUTE: (apiHost: string) =>
      `/api/v1/apis/${encodeURIComponent(apiHost)}/execute`,
    SKILL_BY_NAME: (name: string) =>
      `/api/v1/skills/by-name/${encodeURIComponent(name)}`,
    SKILLS: "/api/v1/skills",
    SKILL: (apiHost: string) => `/api/v1/skills/${encodeURIComponent(apiHost)}`,
    SKILL_MARKDOWN: (apiHost: string) =>
      `/api/v1/skills/${encodeURIComponent(apiHost)}/SKILL.md`,
    SITES: "/api/v1/sites",
    SITE: (origin: string) => `/api/v1/sites/${encodeURIComponent(origin)}`,
    SITE_MCPS: (origin: string) =>
      `/api/v1/sites/${encodeURIComponent(origin)}/mcps`,
    SITE_SKILLS: (origin: string) =>
      `/api/v1/sites/${encodeURIComponent(origin)}/skills`,
    CRAWL_JOBS: "/api/v1/crawl-jobs",
    CRAWL_JOB: (id: string) => `/api/v1/crawl-jobs/${encodeURIComponent(id)}`,
    MCP_PROXY: (apiHost: string) =>
      `${MCP_PROXY_PATH}/${encodeURIComponent(apiHost)}`,
  },
  DEFAULT_HEADERS: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/** A query-string value; `undefined` means "omit this parameter". */
type QueryValue = string | number | boolean | undefined;

/** Options for the private `request` helper. */
interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Shared write key; sent as X-API-Key. Never needed for GET. */
  apiKey?: string;
  query?: Record<string, QueryValue>;
  /** Passed through to the NetworkClient only when set. */
  timeout?: number;
}

/**
 * Append a query string. `undefined` and empty-string values are dropped, so
 * an empty search box yields `/api/v1/mcps` rather than `/api/v1/mcps?q=`.
 */
function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

// =============================================================================
// Client
// =============================================================================

/**
 * HTTP client for raidr_api. Reads are public; writes take the shared API key.
 * The NetworkClient is injected so web, native and tests share one code path.
 *
 * Methods resolve to the response body as the API sent it (a `BaseResponse`
 * or `PaginatedResponse` envelope from raidr_types); nothing is validated at
 * runtime. Prefer the hooks in `../hooks` inside React.
 */
export class RaidrClient {
  private readonly config: ReturnType<typeof createApiConfig>;

  constructor(
    private readonly networkClient: NetworkClient,
    baseUrl: string,
  ) {
    this.config = createApiConfig(baseUrl);
  }

  /** Absolute URL of the raw SKILL.md for an API host. */
  skillMarkdownUrl(apiHost: string): string {
    return `${this.config.BASE_URL}${this.config.ENDPOINTS.SKILL_MARKDOWN(apiHost)}`;
  }

  /** Absolute URL of the hosted MCP endpoint for an API host. */
  mcpProxyUrl(apiHost: string): string {
    return `${this.config.BASE_URL}${this.config.ENDPOINTS.MCP_PROXY(apiHost)}`;
  }

  /**
   * The single place a request is built: base URL + path + query, JSON
   * headers, and `X-API-Key` only when a key is given. Returns
   * `response.data`, i.e. the API's JSON envelope.
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { method = "GET", body, apiKey, query, timeout } = options;
    const headers: Record<string, string> = { ...this.config.DEFAULT_HEADERS };
    if (apiKey) headers[RAIDR_API_KEY_HEADER] = apiKey;

    const response = await this.networkClient.request<T>(
      `${this.config.BASE_URL}${withQuery(endpoint, query)}`,
      {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(timeout !== undefined ? { timeout } : {}),
      },
    );
    return response.data as T;
  }

  // ---- Health ----

  /** `GET /` - service name and status; used to monitor availability. */
  getHealth(): Promise<BaseResponse<HealthCheckData>> {
    return this.request(this.config.ENDPOINTS.HEALTH);
  }

  // ---- MCPs ----

  /** `GET /api/v1/mcps` - one page of MCP summaries (`q`/`limit`/`offset`). */
  getMcps(params?: ListQueryParams): Promise<PaginatedResponse<McpSummary>> {
    return this.request(this.config.ENDPOINTS.MCPS, { query: { ...params } });
  }

  /** `GET /api/v1/mcps/:apiHost` - one MCP with its full manifest. */
  /**
   * One MCP with its full manifest. Needs a signed-in user or an entity API
   * key: in the browser the Firebase-aware NetworkClient adds the token
   * itself; elsewhere pass `apiKey` (`raidr_...`), sent as X-API-Key.
   * Anonymous callers get 401; use {@link getMcpSummary} for them.
   */
  getMcp(apiHost: string, apiKey?: string): Promise<BaseResponse<Mcp>> {
    return this.request(
      this.config.ENDPOINTS.MCP(apiHost),
      apiKey ? { apiKey } : {},
    );
  }

  /** `GET /api/v1/apis` - one page of API doc summaries (no endpoints); public. */
  getApis(params?: ListQueryParams): Promise<PaginatedResponse<ApiDocSummary>> {
    return this.request(this.config.ENDPOINTS.APIS, { query: { ...params } });
  }

  /** `GET /api/v1/apis/:apiHost/summary` - public; title and endpoint count only. */
  getApiSummary(apiHost: string): Promise<BaseResponse<ApiDocSummary>> {
    return this.request(this.config.ENDPOINTS.API_SUMMARY(apiHost));
  }

  /**
   * `GET /api/v1/apis/:apiHost` - the full endpoint docs. Needs a signed-in
   * user (the browser NetworkClient adds the token) or an entity key as `apiKey`.
   */
  getApiDoc(
    apiHost: string,
    apiKey?: string,
  ): Promise<BaseResponse<ApiDocRow>> {
    return this.request(
      this.config.ENDPOINTS.API(apiHost),
      apiKey ? { apiKey } : {},
    );
  }

  /**
   * `POST /api/v1/apis/:apiHost/execute` - run one endpoint through raidr's
   * proxy. Same credentials as `getApiDoc`. The user's site token and any
   * application key travel in the body and are never stored.
   */
  executeApi(
    apiHost: string,
    data: ApiExecuteRequest,
    apiKey?: string,
  ): Promise<BaseResponse<ApiExecuteResult>> {
    return this.request(this.config.ENDPOINTS.API_EXECUTE(apiHost), {
      method: "POST",
      body: data,
      ...(apiKey ? { apiKey } : {}),
    });
  }

  /**
   * `GET /api/v1/apis/:apiHost/flow` - every flow link touching this host,
   * with labels for endpoints on other hosts. Same access as `getApiDoc`.
   */
  getApiFlow(apiHost: string, apiKey?: string): Promise<BaseResponse<ApiFlow>> {
    return this.request(
      this.config.ENDPOINTS.API_FLOW(apiHost),
      apiKey ? { apiKey } : {},
    );
  }

  /** `GET /api/v1/skills/by-name/:name` - one skill by its slug. */
  getSkillByName(name: string): Promise<BaseResponse<Skill>> {
    return this.request(this.config.ENDPOINTS.SKILL_BY_NAME(name));
  }

  /** Public top-level info for one MCP (no manifest); no auth needed. */
  getMcpSummary(apiHost: string): Promise<BaseResponse<McpSummary>> {
    return this.request(this.config.ENDPOINTS.MCP_SUMMARY(apiHost));
  }

  /** `POST /api/v1/mcps` - create an MCP; needs the shared write key. */
  createMcp(
    apiKey: string,
    data: McpUpsertRequest,
  ): Promise<BaseResponse<Mcp>> {
    return this.request(this.config.ENDPOINTS.MCPS, {
      method: "POST",
      body: data,
      apiKey,
    });
  }

  /** `PUT /api/v1/mcps/:apiHost` - create or replace; needs the write key. */
  upsertMcp(
    apiKey: string,
    apiHost: string,
    data: McpUpsertRequest,
  ): Promise<BaseResponse<Mcp>> {
    return this.request(this.config.ENDPOINTS.MCP(apiHost), {
      method: "PUT",
      body: data,
      apiKey,
    });
  }

  /** `DELETE /api/v1/mcps/:apiHost` - needs the write key. */
  deleteMcp(apiKey: string, apiHost: string): Promise<BaseResponse<Mcp>> {
    return this.request(this.config.ENDPOINTS.MCP(apiHost), {
      method: "DELETE",
      apiKey,
    });
  }

  // ---- Skills ----

  /** `GET /api/v1/skills` - one page of skill summaries. */
  getSkills(
    params?: ListQueryParams,
  ): Promise<PaginatedResponse<SkillSummary>> {
    return this.request(this.config.ENDPOINTS.SKILLS, {
      query: { ...params },
    });
  }

  /** `GET /api/v1/skills/:apiHost` - one skill including its SKILL.md text. */
  getSkill(apiHost: string): Promise<BaseResponse<Skill>> {
    return this.request(this.config.ENDPOINTS.SKILL(apiHost));
  }

  /** `POST /api/v1/skills` - create a skill; needs the write key. */
  createSkill(
    apiKey: string,
    data: SkillCreateRequest,
  ): Promise<BaseResponse<Skill>> {
    return this.request(this.config.ENDPOINTS.SKILLS, {
      method: "POST",
      body: data,
      apiKey,
    });
  }

  /** `PUT /api/v1/skills/:apiHost` - create or replace; needs the write key. */
  upsertSkill(
    apiKey: string,
    apiHost: string,
    data: SkillUpsertRequest,
  ): Promise<BaseResponse<Skill>> {
    return this.request(this.config.ENDPOINTS.SKILL(apiHost), {
      method: "PUT",
      body: data,
      apiKey,
    });
  }

  /** `DELETE /api/v1/skills/:apiHost` - needs the write key. */
  deleteSkill(apiKey: string, apiHost: string): Promise<BaseResponse<Skill>> {
    return this.request(this.config.ENDPOINTS.SKILL(apiHost), {
      method: "DELETE",
      apiKey,
    });
  }

  // ---- Sites ----

  /**
   * `GET /api/v1/sites` - one page of sites. `apiHost` narrows to sites seen
   * calling that host (the MCP detail page uses it).
   */
  getSites(params?: SiteListQueryParams): Promise<PaginatedResponse<Site>> {
    return this.request(this.config.ENDPOINTS.SITES, { query: { ...params } });
  }

  /** `GET /api/v1/sites/:origin` - a full origin, URL-encoded here. */
  getSite(origin: string): Promise<BaseResponse<Site>> {
    return this.request(this.config.ENDPOINTS.SITE(origin));
  }

  /** `POST /api/v1/sites` - create a site record; needs the write key. */
  createSite(
    apiKey: string,
    data: SiteCreateRequest,
  ): Promise<BaseResponse<Site>> {
    return this.request(this.config.ENDPOINTS.SITES, {
      method: "POST",
      body: data,
      apiKey,
    });
  }

  /** `PUT /api/v1/sites/:origin` - create or replace; needs the write key. */
  upsertSite(
    apiKey: string,
    origin: string,
    data: SiteUpsertRequest,
  ): Promise<BaseResponse<Site>> {
    return this.request(this.config.ENDPOINTS.SITE(origin), {
      method: "PUT",
      body: data,
      apiKey,
    });
  }

  /** `DELETE /api/v1/sites/:origin` - needs the write key. No hook wraps it. */
  deleteSite(apiKey: string, origin: string): Promise<BaseResponse<Site>> {
    return this.request(this.config.ENDPOINTS.SITE(origin), {
      method: "DELETE",
      apiKey,
    });
  }

  /** `GET /api/v1/sites/:origin/mcps` - the MCP servers made from a site (summaries). */
  getSiteMcps(origin: string): Promise<BaseResponse<McpSummary[]>> {
    return this.request(this.config.ENDPOINTS.SITE_MCPS(origin));
  }

  /** `GET /api/v1/sites/:origin/skills` - the skills made from a site (summaries). */
  getSiteSkills(origin: string): Promise<BaseResponse<SkillSummary[]>> {
    return this.request(this.config.ENDPOINTS.SITE_SKILLS(origin));
  }

  /** `GET /api/v1/crawl-jobs` - the crawl queue, newest first; `status` and `q` (origin) filter it. */
  getCrawlJobs(
    params?: CrawlJobListQueryParams,
  ): Promise<PaginatedResponse<CrawlJob>> {
    return this.request(this.config.ENDPOINTS.CRAWL_JOBS, {
      query: { ...params },
    });
  }

  /** `GET /api/v1/crawl-jobs/:id`. */
  getCrawlJob(id: string): Promise<BaseResponse<CrawlJob>> {
    return this.request(this.config.ENDPOINTS.CRAWL_JOB(id));
  }

  /**
   * `POST /api/v1/crawl-jobs` - add origins to the crawl queue; needs the
   * write key. Sites already crawled are not queued unless `force` is set.
   */
  enqueueCrawlJobs(
    apiKey: string,
    data: CrawlJobEnqueueRequest,
  ): Promise<BaseResponse<CrawlJobEnqueueResult[]>> {
    return this.request(this.config.ENDPOINTS.CRAWL_JOBS, {
      method: "POST",
      body: data,
      apiKey,
    });
  }
}

/** Factory equivalent of `new RaidrClient(networkClient, baseUrl)`. */
export const createRaidrClient = (
  networkClient: NetworkClient,
  baseUrl: string,
): RaidrClient => new RaidrClient(networkClient, baseUrl);
