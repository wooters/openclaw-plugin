/**
 * Configuration handling for CrabCallr plugin
 */

import type { CrabCallrConfig, FillerConfig, IdleConfig, ResolvedFillerConfig, ResolvedIdleConfig } from './types.js';

/**
 * Input type for validateConfig — uses optional (unresolved) sub-configs
 */
type ValidateConfigInput = Omit<Partial<CrabCallrConfig>, 'fillers' | 'idle'> & {
  fillers?: FillerConfig;
  idle?: IdleConfig;
};

/**
 * Default filler configuration
 */
export const DEFAULT_FILLER_CONFIG: ResolvedFillerConfig = {
  enabled: true,
  phrases: ['Working on that...', 'Still thinking...', 'Bear with me...'],
  initialDelaySec: 3,
  intervalSec: 6,
  maxPerRequest: 3,
};

/**
 * Default idle detection configuration
 */
export const DEFAULT_IDLE_CONFIG: ResolvedIdleConfig = {
  enabled: true,
  timeoutSec: 60,
  prompt: 'Are you still there?',
  maxPrompts: 2,
  endMessage: "It seems like you've stepped away. Goodbye!",
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<CrabCallrConfig, 'apiKey'> = {
  serviceUrl: 'wss://ws.crabcallr.com/plugin',
  autoConnect: true,
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  requestTimeoutSec: 25,
  fillers: DEFAULT_FILLER_CONFIG,
  idle: DEFAULT_IDLE_CONFIG,
};

/**
 * Validates and normalizes plugin configuration
 */
export function validateConfig(config: ValidateConfigInput): CrabCallrConfig {
  const apiKey = config.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      'CrabCallr API key is required. Get one at https://app.crabcallr.com'
    );
  }

  if (!apiKey.startsWith('cc_')) {
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

  const requestTimeoutSec = config.requestTimeoutSec ?? DEFAULT_CONFIG.requestTimeoutSec;
  if (requestTimeoutSec < 5) {
    throw new Error('requestTimeoutSec must be at least 5');
  }

  // Resolve filler config
  const fillers = resolveFillerConfig(config.fillers);

  // Resolve idle config
  const idle = resolveIdleConfig(config.idle);

  return {
    apiKey,
    serviceUrl,
    autoConnect: config.autoConnect ?? DEFAULT_CONFIG.autoConnect,
    reconnectInterval,
    maxReconnectAttempts,
    requestTimeoutSec,
    fillers,
    idle,
  };
}

function resolveFillerConfig(input?: Partial<ResolvedFillerConfig>): ResolvedFillerConfig {
  const config: ResolvedFillerConfig = {
    enabled: input?.enabled ?? DEFAULT_FILLER_CONFIG.enabled,
    phrases: input?.phrases ?? DEFAULT_FILLER_CONFIG.phrases,
    initialDelaySec: input?.initialDelaySec ?? DEFAULT_FILLER_CONFIG.initialDelaySec,
    intervalSec: input?.intervalSec ?? DEFAULT_FILLER_CONFIG.intervalSec,
    maxPerRequest: input?.maxPerRequest ?? DEFAULT_FILLER_CONFIG.maxPerRequest,
  };

  if (config.initialDelaySec <= 0) {
    throw new Error('fillers.initialDelaySec must be greater than 0');
  }
  if (config.intervalSec <= 0) {
    throw new Error('fillers.intervalSec must be greater than 0');
  }
  if (config.maxPerRequest < 0) {
    throw new Error('fillers.maxPerRequest cannot be negative');
  }

  return config;
}

function resolveIdleConfig(input?: Partial<ResolvedIdleConfig>): ResolvedIdleConfig {
  const config: ResolvedIdleConfig = {
    enabled: input?.enabled ?? DEFAULT_IDLE_CONFIG.enabled,
    timeoutSec: input?.timeoutSec ?? DEFAULT_IDLE_CONFIG.timeoutSec,
    prompt: input?.prompt ?? DEFAULT_IDLE_CONFIG.prompt,
    maxPrompts: input?.maxPrompts ?? DEFAULT_IDLE_CONFIG.maxPrompts,
    endMessage: input?.endMessage ?? DEFAULT_IDLE_CONFIG.endMessage,
  };

  if (config.timeoutSec <= 0) {
    throw new Error('idle.timeoutSec must be greater than 0');
  }
  if (config.maxPrompts < 0) {
    throw new Error('idle.maxPrompts cannot be negative');
  }

  return config;
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
