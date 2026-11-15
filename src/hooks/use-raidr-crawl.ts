/**
 * Hooks for the crawl queue and for what a site produced (its MCP servers
 * and skills). Enqueueing needs the write key, passed as `token`.
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
  CrawlJob,
  CrawlJobEnqueueRequest,
  CrawlJobEnqueueResult,
  CrawlJobListQueryParams,
  McpSummary,
  SkillSummary,
} from "@sudobility/raidr_types";
import { queryKeys } from "./query-keys";
import { STALE_TIMES } from "./query-config";
import { useRaidrClient } from "./use-raidr-client";

type QueryOpts<T> = Omit<UseQueryOptions<T>, "queryKey" | "queryFn">;

/** MCP servers made from one site. Disabled while `origin` is empty. */
export const useRaidrSiteMcps = (
  networkClient: NetworkClient,
  baseUrl: string,
  origin: string,
  options?: QueryOpts<BaseResponse<McpSummary[]>>,
): UseQueryResult<BaseResponse<McpSummary[]>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.siteMcps(origin),
    queryFn: () => client.getSiteMcps(origin),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
    enabled: origin.length > 0 && (options?.enabled ?? true),
  });
};

/** Skills made from one site. Disabled while `origin` is empty. */
export const useRaidrSiteSkills = (
  networkClient: NetworkClient,
  baseUrl: string,
  origin: string,
  options?: QueryOpts<BaseResponse<SkillSummary[]>>,
): UseQueryResult<BaseResponse<SkillSummary[]>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.siteSkills(origin),
    queryFn: () => client.getSiteSkills(origin),
    staleTime: STALE_TIMES.DETAIL,
    ...options,
    enabled: origin.length > 0 && (options?.enabled ?? true),
  });
};

/** One page of the crawl queue. Uses the health stale time: the queue moves. */
export const useRaidrCrawlJobs = (
  networkClient: NetworkClient,
  baseUrl: string,
  params?: CrawlJobListQueryParams,
  options?: QueryOpts<PaginatedResponse<CrawlJob>>,
): UseQueryResult<PaginatedResponse<CrawlJob>> => {
  const client = useRaidrClient(networkClient, baseUrl);
  return useQuery({
    queryKey: queryKeys.raidr.crawlJobs(params ?? {}),
    queryFn: () => client.getCrawlJobs(params),
    staleTime: STALE_TIMES.HEALTH,
    ...options,
  });
};

/** Add origins to the crawl queue with the write key; refreshes queue lists. */
export const useRaidrEnqueueCrawlJobs = (
  networkClient: NetworkClient,
  baseUrl: string,
): UseMutationResult<
  BaseResponse<CrawlJobEnqueueResult[]>,
  Error,
  { token: string; data: CrawlJobEnqueueRequest }
> => {
  const client = useRaidrClient(networkClient, baseUrl);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, data }) => client.enqueueCrawlJobs(token, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.raidr.crawlJobs(),
      });
    },
  });
};
