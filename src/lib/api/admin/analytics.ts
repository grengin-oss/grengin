import { request } from '../client.js';
import type { AnalyticsOverview, AnalyticsTimeseries, UserAnalyticsResponse } from '../../admin/types.js';

export interface GetAnalyticsOverviewParams {
  start_date: string;
  end_date: string;
}

export interface GetAnalyticsTimeseriesParams {
  start_date: string;
  end_date: string;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      queryParams.set(key, String(value));
    }
  }
  const query = queryParams.toString();
  return query ? `?${query}` : '';
}

export async function getAnalyticsOverview(params: GetAnalyticsOverviewParams): Promise<AnalyticsOverview> {
  return request<AnalyticsOverview>(`/admin/analytics/overview${buildQueryString(params as unknown as Record<string, string | number | boolean | undefined>)}`);
}

export async function getAnalyticsTimeseries(params: GetAnalyticsTimeseriesParams): Promise<AnalyticsTimeseries> {
  return request<AnalyticsTimeseries>(`/admin/analytics/timeseries${buildQueryString(params as unknown as Record<string, string | number | boolean | undefined>)}`);
}

export interface GetUserAnalyticsParams {
  start_date: string;
  end_date: string;
  page?: number;
  limit?: number;
  sort_by?: 'name' | 'email' | 'requests' | 'tokens' | 'cost' | 'latency' | 'last_activity';
  order?: 'asc' | 'desc';
}

export async function getUserAnalytics(params: GetUserAnalyticsParams): Promise<UserAnalyticsResponse> {
  return request<UserAnalyticsResponse>(`/admin/analytics/users${buildQueryString(params as unknown as Record<string, string | number | boolean | undefined>)}`);
}
