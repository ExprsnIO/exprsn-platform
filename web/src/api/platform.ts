import { http } from '@/lib/http';

export interface ModuleStatus {
  name: string;
  prefix: string;
  mounted: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
  env: string;
  modules: ModuleStatus[];
}

/** Aggregate gateway health — lists every mounted module. */
export const getHealth = () => http.get<HealthResponse>('/health');
