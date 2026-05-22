import { RemoteApiClient } from './remoteClient';
import { LocalApiClient } from './localClient';
import type { ApiClientInterface } from './types';

// Re-export shared types so existing imports keep working
export type { User, AuthResponse, GameResponse, ApiClientInterface } from './types';

export const OFFLINE_MODE = (import.meta as any).env?.VITE_OFFLINE_MODE === 'true';

export const apiClient: ApiClientInterface = OFFLINE_MODE
  ? new LocalApiClient()
  : new RemoteApiClient();

