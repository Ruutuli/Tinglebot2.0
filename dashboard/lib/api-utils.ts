import type { NextRequest } from "next/server";
import type { PaginatedResponse } from "@/types/api";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

export type ParsePaginatedQueryResult = {
  page: number;
  limit: number;
  search: string;
};

export function parsePaginatedQuery(req: NextRequest): ParsePaginatedQueryResult {
  const params = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") ?? String(DEFAULT_PAGE), 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const search = (params.get("search") ?? "").trim();
  return { page, limit, search };
}

export function getFilterParam(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key);
  return v != null && v.trim() !== "" ? v.trim() : undefined;
}

export function getFilterParamMultiple(params: URLSearchParams, key: string): string[] {
  const v = params.get(key);
  if (v == null || v.trim() === "") return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export function getFilterParamNumeric(params: URLSearchParams, key: string): number[] {
  const v = params.get(key);
  if (v == null || v.trim() === "") return [];
  return v
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

export function flatFilterOptions(arr: unknown[]): (string | number)[] {
  return Array.from(new Set((arr as (string | number)[][]).flat().filter(Boolean))).sort(
    (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b)))
  );
}

export function buildListResponse<T>(payload: {
  data: T[];
  total: number;
  page: number;
  limit: number;
  filterOptions?: Record<string, (string | number)[]>;
}): PaginatedResponse<T> {
  const { data, total, page, limit, filterOptions } = payload;
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    ...(filterOptions != null && Object.keys(filterOptions).length > 0 ? { filterOptions } : {}),
  };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSearchRegex(search: string): RegExp | null {
  const s = search.trim();
  if (!s) return null;
  try {
    return new RegExp(escapeRegExp(s), "i");
  } catch {
    return null;
  }
}
