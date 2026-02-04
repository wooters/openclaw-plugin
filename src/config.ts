/**
 * Configuration handling for CrabCallr plugin
 */

import type { CrabCallrConfig } from './types';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<CrabCallrConfig, 'apiKey'> = {
  serviceUrl: 'wss://ws.crabcallr.com/plugin',
  autoConnect: true,
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
};

/**
 * Validates and normalizes plugin configuration
 */
export function validateConfig(config: Partial<CrabCallrConfig>): CrabCallrConfig {
  if (!config.apiKey) {
    throw new Error(
      'CrabCallr API key is required. Get one at https://app.crabcallr.com'
    );
  }

  if (!config.apiKey.startsWith('cc_')) {
    throw new Error(
      'Invalid CrabCallr API key format. Keys should start with "cc_"'
    );
  }

  const serviceUrl = config.serviceUrl ?? DEFAULT_CONFIG.serviceUrl;

  // Validate WebSocket URL
  if (!serviceUrl.startsWith('ws://') && !serviceUrl.startsWith('wss://')) {
    throw new Error(
      'Invalid service URL. Must be a WebSocket URL (ws:// or wss://)'
    );
  }

  const reconnectInterval = config.reconnectInterval ?? DEFAULT_CONFIG.reconnectInterval;
  if (reconnectInterval < 1000) {
    throw new Error('Reconnect interval must be at least 1000ms');
  }

  const maxReconnectAttempts = config.maxReconnectAttempts ?? DEFAULT_CONFIG.maxReconnectAttempts;
  if (maxReconnectAttempts < 0) {
    throw new Error('Max reconnect attempts cannot be negative');
  }

  return {
    apiKey: config.apiKey,
    serviceUrl,
    autoConnect: config.autoConnect ?? DEFAULT_CONFIG.autoConnect,
    reconnectInterval,
    maxReconnectAttempts,
  };
}

/**
 * Masks an API key for logging (shows first 3 and last 4 chars)
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) {
    return '***';
  }
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}
