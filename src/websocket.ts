/**
 * WebSocket connection manager for CrabCallr service
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type {
  CrabCallrConfig,
  CrabCallrEvents,
  CrabCallrLogger,
  CallEndMessage,
  CallEndRequestMessage,
  CallStartMessage,
  ConnectionStatus,
  InboundWsMessage,
  OutboundWsMessage,
  PongMessage,
  UtteranceMessage,
  AuthMessage,
} from './types.js';
import { MessageType } from './types.js';
import { maskApiKey } from './config.js';

// Plugin version for User-Agent header
const PLUGIN_VERSION = '0.1.0';

// Ping interval for keepalive
const PING_INTERVAL = 30000;

// Ping timeout
const PING_TIMEOUT = 10000;

/**
 * Type-safe event emitter for CrabCallr events
 */
export interface CrabCallrWebSocket {
  on<K extends keyof CrabCallrEvents>(event: K, listener: CrabCallrEvents[K]): this;
  off<K extends keyof CrabCallrEvents>(event: K, listener: CrabCallrEvents[K]): this;
  emit<K extends keyof CrabCallrEvents>(event: K, ...args: Parameters<CrabCallrEvents[K]>): boolean;
}

/**
 * Manages WebSocket connection to CrabCallr service
 */
export class CrabCallrWebSocket extends EventEmitter {
  private config: CrabCallrConfig;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingTimeout: NodeJS.Timeout | null = null;
  private authenticated = false;
  private userId: string | null = null;
  private logger: CrabCallrLogger;

  constructor(config: CrabCallrConfig, logger: CrabCallrLogger) {
    super();
    this.config = config;
    this.logger = logger;
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected and authenticated
   */
  isConnected(): boolean {
    return this.status === 'connected' && this.authenticated;
  }

  /**
   * Get authenticated user ID
   */
  getUserId(): string | null {
    return this.userId;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Connect to the CrabCallr service
   */
  connect(): void {
    if (this.ws && (this.status === 'connected' || this.status === 'connecting')) {
      this.logger.warn('[CrabCallr] Already connected or connecting');
      return;
    }

    this.setStatus('connecting');
    this.logger.info(`[CrabCallr] Connecting to ${this.config.serviceUrl}`);

    try {
      this.ws = new WebSocket(this.config.serviceUrl, {
        headers: {
          'User-Agent': `CrabCallr-Plugin/${PLUGIN_VERSION}`,
        },
      });

      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
      this.ws.on('error', (error) => this.handleError(error));
    } catch (error) {
      this.logger.error(
        `[CrabCallr] Failed to create WebSocket connection: ${String(error)}`,
      );
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the service
   */
  disconnect(): void {
    this.logger.info('[CrabCallr] Disconnecting from CrabCallr service');
    this.clearTimers();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }

    this.authenticated = false;
    this.userId = null;
    this.setStatus('disconnected');
    this.emit('disconnected', 'Client initiated disconnect');
  }

  /**
   * Send an utterance (response, filler, or goodbye)
   */
  sendUtterance(callId: string, utteranceId: string, text: string, endCall?: boolean): void {
    if (!this.isConnected() || !this.userId) {
      this.logger.warn('[CrabCallr] Cannot send utterance: not connected');
      return;
    }

    const message: UtteranceMessage = {
      type: MessageType.UTTERANCE,
      utteranceId,
      callId,
      text,
      ...(endCall ? { endCall } : {}),
    };

    this.send(message);
  }

  /**
   * Request to end a call
   */
  sendCallEndRequest(callId: string): void {
    if (!this.isConnected() || !this.userId) {
      this.logger.warn('[CrabCallr] Cannot request call end: not connected');
      return;
    }

    const message: CallEndRequestMessage = {
      type: 'call_end_request' as MessageType.CALL_END_REQUEST,
      userId: this.userId,
      callId,
    };

    this.send(message);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
    this.logger.debug?.(`[CrabCallr] Status changed to: ${status}`);
    }
  }

  private handleOpen(): void {
    this.logger.info('[CrabCallr] WebSocket connected, authenticating...');
    this.reconnectAttempts = 0;

    // Send authentication
    const authMessage: AuthMessage = {
      type: 'auth' as MessageType.AUTH,
      apiKey: this.config.apiKey,
    };

    this.send(authMessage);
  }

  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as InboundWsMessage;
      this.processMessage(message);
    } catch (error) {
      this.logger.error(`[CrabCallr] Failed to parse message: ${String(error)}`);
    }
  }

  private processMessage(message: InboundWsMessage): void {
    switch (message.type) {
      case 'auth_result':
        this.handleAuthResult(message);
        break;

      case 'user_message':
        this.handleUserMessage(message);
        break;

      case 'ping':
        this.handlePing();
        break;

      case 'pong':
        this.handlePong();
        break;

      case 'call_start':
        this.handleCallStart(message);
        break;

      case 'call_end':
        this.handleCallEnd(message);
        break;

      default:
        this.logger.warn(`[CrabCallr] Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  private handleAuthResult(message: { success: boolean; userId?: string; error?: string }): void {
    if (message.success) {
      this.authenticated = true;
      this.userId = message.userId ?? null;
      this.setStatus('connected');
      this.logger.info(`[CrabCallr] Authenticated successfully (userId: ${this.userId})`);
      this.startPingTimer();
      this.emit('connected');
    } else {
      this.logger.error(`[CrabCallr] Authentication failed: ${message.error}`);
      this.setStatus('error');
      this.emit('error', new Error(`Authentication failed: ${message.error}`));
      // Don't reconnect on auth failure - API key is likely invalid
      this.disconnect();
    }
  }

  private handleUserMessage(message: { messageId: string; text: string; callId: string }): void {
    const { messageId, text, callId } = message;
    this.logger.debug?.(`[CrabCallr] User message: "${text}"`);
    this.emit('userMessage', messageId, text, callId);
  }

  private handlePing(): void {
    this.logger.debug?.('[CrabCallr] Received ping, sending pong');
    const pong: PongMessage = {
      type: 'pong' as MessageType.PONG,
    };
    this.send(pong);
  }

  private handlePong(): void {
    // Clear the ping timeout - connection is healthy
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    this.logger.debug?.('[CrabCallr] Received pong');
  }

  private handleCallStart(message: CallStartMessage): void {
    this.logger.info(`[CrabCallr] Call started: ${message.callId} (${message.source})`);
    this.emit('callStart', message.callId, message.source);
  }

  private handleCallEnd(message: CallEndMessage): void {
    this.logger.info(`[CrabCallr] Call ended: ${message.callId} (duration: ${message.durationSeconds}s)`);
    this.emit('callEnd', message.callId, message.durationSeconds, message.source, message.startedAt);
  }

  private handleClose(code: number, reason: string): void {
    this.logger.info(`[CrabCallr] WebSocket closed: ${code} - ${reason}`);
    this.clearTimers();
    this.authenticated = false;

    const wasConnected = this.status === 'connected';
    this.setStatus('disconnected');

    if (wasConnected) {
      this.emit('disconnected', reason || 'Connection closed');
    }

    // Reconnect unless it was a clean close or auth failure
    if (code !== 1000) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    this.logger.error(`[CrabCallr] WebSocket error: ${String(error)}`);
    this.emit('error', error);
  }

  private send(message: OutboundWsMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('[CrabCallr] Cannot send message: WebSocket not open');
      return;
    }

    try {
      // Don't log the full auth message (contains API key)
      if (message.type === 'auth') {
        this.logger.debug?.(`[CrabCallr] Sending: auth (key: ${maskApiKey(this.config.apiKey)})`);
      } else {
        this.logger.debug?.(`[CrabCallr] Sending: ${message.type}`);
      }
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error(`[CrabCallr] Failed to send message: ${String(error)}`);
    }
  }

  private scheduleReconnect(): void {
    if (this.config.maxReconnectAttempts > 0 &&
        this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error(`[CrabCallr] Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
      this.setStatus('error');
      return;
    }

    this.reconnectAttempts++;
    this.setStatus('reconnecting');

    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectInterval;
    const delay = Math.min(
      baseDelay * Math.pow(1.5, this.reconnectAttempts - 1) + Math.random() * 1000,
      60000 // Max 60 seconds
    );

    this.logger.info(`[CrabCallr] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingTimer(): void {
    this.clearPingTimers();

    this.pingTimer = setInterval(() => {
      if (!this.isConnected()) return;

      this.logger.debug?.('[CrabCallr] Sending ping');
      const ping = { type: 'ping', timestamp: Date.now() };
      this.ws?.send(JSON.stringify(ping));

      // Set timeout for pong response
      this.pingTimeout = setTimeout(() => {
        this.logger.warn('[CrabCallr] Ping timeout - reconnecting');
        this.ws?.close(4000, 'Ping timeout');
      }, PING_TIMEOUT);
    }, PING_INTERVAL);
  }

  private clearPingTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  private clearTimers(): void {
    this.clearPingTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
