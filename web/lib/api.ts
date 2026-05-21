// Shared API types — relative import from the sibling server package via tsconfig path.
import type {
  ApiResult,
  AdminConfig,
  AdminConfigUpdateBody,
  FunnelReport,
  StatsReport,
  ExportHistoryItem,
  ExportHistoryReport,
  ManualExtractResult,
  ManualExtractBody,
  ExtractPreviewItem,
  MatchMoveActionBody,
  MatchMoveActionResult,
  MatchMoveState,
  PromotionMap,
  PromotionMapUpdateBody,
} from '@shared/api';

export type {
  ApiResult,
  AdminConfig,
  AdminConfigUpdateBody,
  FunnelReport,
  StatsReport,
  ExportHistoryItem,
  ExportHistoryReport,
  ManualExtractResult,
  ManualExtractBody,
  ExtractPreviewItem,
  MatchMoveActionBody,
  MatchMoveActionResult,
  MatchMoveState,
  PromotionMap,
  PromotionMapUpdateBody,
};

const SERVER_API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';
export const CLIENT_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export async function serverFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(`${SERVER_API_BASE}${path}`, { cache: 'no-store', ...init });
  return (await res.json()) as ApiResult<T>;
}

export async function clientFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(`${CLIENT_API_BASE}${path}`, { ...init });
  return (await res.json()) as ApiResult<T>;
}
