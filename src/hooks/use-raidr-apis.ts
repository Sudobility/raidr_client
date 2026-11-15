/**
 * Hooks for API documentation (the API playground) and running an endpoint.
 * `useRaidrApiDoc` needs a signed-in user or an entity key; the summary and
 * list are public. `useRaidrExecuteApi` is a mutation: every run is a fresh
 * upstream call, never cached.
 */
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  BaseResponse,
  NetworkClient,
  PaginatedResponse,
} from "@sudobility/types";
import type {
  ApiDocRow,
  ApiDocSummary,
  ApiExecuteRequest,
  ApiExecuteResult,
  ApiFlow,
  ListQueryParams,
  Skill,
} from "@sudobility/raidr_types";
import { queryKeys } from "./query-keys";
import { STALE_TIMES } from "./query-config";
import { useRaidrClient } from "./use-raidr-client";

type QueryOpts<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

/** One page of API doc summaries. */
export const useRaidrApis = (
  networkClient: NetworkClient,
  baseUrl: string,
  params?: ListQueryParams,
  options?: QueryOpts<PaginatedResponse<ApiDocSummary>>,
): UseQueryResult<PaginatedResponse<ApiDocSummary>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.apis(params ?? {}),
    queryFn: () => client.getApis(params),
    staleTime: STALE_TIMES.CATALOG,
    ...options,
  });
};

/** Public summary of one API host's docs. Disabled while `apiHost` is empty. */
export const useRaidrApiSummary = (
  networkClient: NetworkClient,
  baseUrl: string,
  apiHost: string,
  options?: QueryOpts<BaseResponse<ApiDocSummary>>,
): UseQueryResult<BaseResponse<ApiDocSummary>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.apiSummary(apiHost),
    queryFn: () => client.getApiSummary(apiHost),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
    enabled: apiHost.length > 0 && (options?.enabled ?? true),
  });
};

/** Full endpoint docs. Pass `enabled: false` while signed out (the API answers 401). */
export const useRaidrApiDoc = (
  networkClient: NetworkClient,
  baseUrl: string,
  apiHost: string,
  options?: QueryOpts<BaseResponse<ApiDocRow>>,
): UseQueryResult<BaseResponse<ApiDocRow>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.apiDoc(apiHost),
    queryFn: () => client.getApiDoc(apiHost),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
    enabled: apiHost.length > 0 && (options?.enabled ?? true),
  });
};

/** Flow links for one API host. Pass `enabled: false` while signed out. */
export const useRaidrApiFlow = (
  networkClient: NetworkClient,
  baseUrl: string,
  apiHost: string,
  options?: QueryOpts<BaseResponse<ApiFlow>>,
): UseQueryResult<BaseResponse<ApiFlow>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.apiFlow(apiHost),
    queryFn: () => client.getApiFlow(apiHost),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
    enabled: apiHost.length > 0 && (options?.enabled ?? true),
  });
};

/** Run one endpoint through raidr's proxy. */
export const useRaidrExecuteApi = (
  networkClient: NetworkClient,
  baseUrl: string,
): UseMutationResult<
  BaseResponse<ApiExecuteResult>,
  Error,
  { apiHost: string; data: ApiExecuteRequest; apiKey?: string }
> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useMutation({
    mutationFn: ({ apiHost, data, apiKey }) =>
      client.executeApi(apiHost, data, apiKey),
  });
};

/** One skill by slug. Disabled while `name` is empty. */
export const useRaidrSkillByName = (
  networkClient: NetworkClient,
  baseUrl: string,
  name: string,
  options?: QueryOpts<BaseResponse<Skill>>,
): UseQueryResult<BaseResponse<Skill>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.skillByName(name),
    queryFn: () => client.getSkillByName(name),
    staleTime: STALE_TIMES.DETAIL,
    retry: false,
    ...options,
    enabled: name.length > 0 && (options?.enabled ?? true),
  });
};
