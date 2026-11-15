/**
 * Hooks for agent skills, keyed by API host (one SKILL.md per host). Same
 * shape as the MCP hooks.
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
  Skill,
  SkillSummary,
  SkillUpsertRequest,
} from "@sudobility/raidr_types";
import { queryKeys } from "./query-keys";
import { STALE_TIMES } from "./query-config";
import { useRaidrClient } from "./use-raidr-client";

/** Caller-overridable `useQuery` options; key and fetcher are fixed. */
type QueryOpts<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

/** One page of the skill catalog; each filter combination caches separately. */
export const useRaidrSkills = (
  networkClient: NetworkClient,
  baseUrl: string,
  params?: ListQueryParams,
  options?: QueryOpts<PaginatedResponse<SkillSummary>>,
): UseQueryResult<PaginatedResponse<SkillSummary>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.skills(params ?? {}),
    queryFn: () => client.getSkills(params),
    staleTime: STALE_TIMES.CATALOG,
    ...options,
  });
};

/**
 * One skill by API host. `retry: false` by default (callers may override it)
 * because the MCP page asks for a skill that often does not exist. Disabled
 * while `apiHost` is empty (not overridable).
 */
export const useRaidrSkill = (
  networkClient: NetworkClient,
  baseUrl: string,
  apiHost: string,
  options?: QueryOpts<BaseResponse<Skill>>,
): UseQueryResult<BaseResponse<Skill>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.skill(apiHost),
    queryFn: () => client.getSkill(apiHost),
    staleTime: STALE_TIMES.DETAIL,
    // A missing skill is a normal state for an MCP, not a failure to retry.
    retry: false,
    ...options,
    enabled: apiHost.length > 0 && (options?.enabled ?? true),
  });
};

/** Create or replace a skill with the write key passed as `token`. */
export const useRaidrUpsertSkill = (
  networkClient: NetworkClient,
  baseUrl: string,
): UseMutationResult<
  BaseResponse<Skill>,
  Error,
  { token: string; apiHost: string; data: SkillUpsertRequest }
> => {
  const client = useRaidrClient(networkClient, baseUrl);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, apiHost, data }) =>
      client.upsertSkill(token, apiHost, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.raidr.skills() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.raidr.skill(variables.apiHost),
      });
    },
  });
};

/** Delete a skill; removes (not invalidates) its detail entry. */
export const useRaidrDeleteSkill = (
  networkClient: NetworkClient,
  baseUrl: string,
): UseMutationResult<
  BaseResponse<Skill>,
  Error,
  { token: string; apiHost: string }
> => {
  const client = useRaidrClient(networkClient, baseUrl);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, apiHost }) => client.deleteSkill(token, apiHost),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.raidr.skills() });
      queryClient.removeQueries({
        queryKey: queryKeys.raidr.skill(variables.apiHost),
      });
    },
  });
};
