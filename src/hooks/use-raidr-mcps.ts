/**
 * Hooks for the MCP catalog. Reads are public; mutations take the shared
 * API key as `token` and invalidate the list and the affected detail key.
 */
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  BaseResponse,
  NetworkClient,
  PaginatedResponse,
} from "@sudobility/types";
import type {
  ListQueryParams,
  Mcp,
  McpSummary,
  McpUpsertRequest,
} from "@sudobility/raidr_types";
import { queryKeys } from "./query-keys";
import { STALE_TIMES } from "./query-config";
import { useRaidrClient } from "./use-raidr-client";

/** Caller-overridable `useQuery` options; key and fetcher are fixed. */
type QueryOpts<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

/** One page of the MCP catalog; each filter combination caches separately. */
export const useRaidrMcps = (
  networkClient: NetworkClient,
  baseUrl: string,
  params?: ListQueryParams,
  options?: QueryOpts<PaginatedResponse<McpSummary>>,
): UseQueryResult<PaginatedResponse<McpSummary>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.mcps(params ?? {}),
    queryFn: () => client.getMcps(params),
    staleTime: STALE_TIMES.CATALOG,
    ...options,
  });
};

/**
 * One MCP by API host. Disabled while `apiHost` is empty; `enabled` is set
 * after the options spread so a caller cannot force a request for `""`.
 * A missing MCP rejects with a 404 `NetworkError`; raidr_lib turns that into
 * `notFound` and passes `retry: false`.
 */
/**
 * Public summary of one MCP (title, description, version, tool count). Works
 * signed out; the app shows it next to the sign-in prompt.
 */
export const useRaidrMcpSummary = (
  networkClient: NetworkClient,
  baseUrl: string,
  apiHost: string,
  options?: QueryOpts<BaseResponse<McpSummary>>,
): UseQueryResult<BaseResponse<McpSummary>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.mcpSummary(apiHost),
    queryFn: () => client.getMcpSummary(apiHost),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
    enabled: apiHost.length > 0 && (options?.enabled ?? true),
  });
};

/**
 * One MCP with its full manifest. Requires auth: pass `enabled: false` while
 * signed out, or the query fails with a 401 NetworkError.
 */
export const useRaidrMcp = (
  networkClient: NetworkClient,
  baseUrl: string,
  apiHost: string,
  options?: QueryOpts<BaseResponse<Mcp>>,
): UseQueryResult<BaseResponse<Mcp>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.mcp(apiHost),
    queryFn: () => client.getMcp(apiHost),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
    enabled: apiHost.length > 0 && (options?.enabled ?? true),
  });
};

/** Create or replace an MCP with the write key passed as `token`. */
export const useRaidrUpsertMcp = (
  networkClient: NetworkClient,
  baseUrl: string,
): UseMutationResult<
  BaseResponse<Mcp>,
  Error,
  { token: string; apiHost: string; data: McpUpsertRequest }
> => {
  const client = useRaidrClient(networkClient, baseUrl);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, apiHost, data }) =>
      client.upsertMcp(token, apiHost, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.raidr.mcps() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.raidr.mcp(variables.apiHost),
      });
    },
  });
};

/**
 * Delete an MCP with the write key passed as `token`. The detail entry is
 * removed rather than invalidated, since refetching it could only 404.
 */
export const useRaidrDeleteMcp = (
  networkClient: NetworkClient,
  baseUrl: string,
): UseMutationResult<
  BaseResponse<Mcp>,
  Error,
  { token: string; apiHost: string }
> => {
  const client = useRaidrClient(networkClient, baseUrl);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, apiHost }) => client.deleteMcp(token, apiHost),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.raidr.mcps() });
      queryClient.removeQueries({
        queryKey: queryKeys.raidr.mcp(variables.apiHost),
      });
    },
  });
};
