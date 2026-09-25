export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  services: { database: 'up' | 'down'; redis: 'up' | 'down' };
}

export interface ApiErrorBody {
  message: string;
  fieldErrors?: Record<string, string>;
}
