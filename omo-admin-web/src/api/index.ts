import { mockApi } from './mock';
import { realApi } from './real';

export const isMockMode = import.meta.env.VITE_USE_MOCK !== 'false';
export const api = isMockMode ? mockApi : realApi;
export type { AdminApi } from './contract';
