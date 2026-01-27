/**
 * WebSocket connection manager for CallMolt service
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type {
  CallMoltConfig,
  ConnectionStatus,
  MessageType,
  InboundMessage,
  OutboundMessage,
  AuthMessage,
  ResponseMessage,
  PongMessage,
  ActiveCall,
  CallMoltEvents,
} from './types';
import { maskApiKey } from './config';

// Plugin version for authentication
const PLUGIN_VERSION = '0.1.0';

// Ping interval for keepalive
const PING_INTERVAL = 30000;

// Ping timeout
const PING_TIMEOUT = 10000;

/**
 * Type-safe event emitter for CallMolt events
 */
export interface CallMoltWebSocket {
  on<K extends keyof CallMoltEvents>(event: K, listener: CallMoltEvents[K]): this;
  off<K extends keyof CallMoltEvents>(event: K, listener: CallMoltEvents[K]): this;
  emit<K extends keyof CallMoltEvents>(event: K, ...args: Parameters<CallMoltEvents[K]>): boolean;
}

/**
 * Manages WebSocket connection to CallMolt service
 */
export class CallMoltWebSocket extends EventEmitter {
  private config: CallMoltConfig;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingTimeout: NodeJS.Timeout | null = null;
  private authenticated = false;
  private userId: string | null = null;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private logger: (level: string, message: string, ...args: unknown[]) => void;

  constructor(
    config: CallMoltConfig,
    logger?: (level: string, message: string, ...args: unknown[]) => void
  ) {
    super();
    this.config = config;
    this.logger = logger ?? ((level, msg, ...args) => {
      const fn = level === 'error' ? console.error : console.log;
      fn(`[CallMolt] ${msg}`, ...args);
    });
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

  /**
   * Get active calls
   */
  getActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Connect to the CallMolt service
   */
  connect(): void {
    if (this.ws && (this.status === 'connected' || this.status === 'connecting')) {
      this.log('warn', 'Already connected or connecting');
      return;
    }

    this.setStatus('connecting');
    this.log('info', `Connecting to ${this.config.serviceUrl}`);

    try {
      this.ws = new WebSocket(this.config.serviceUrl, {
        headers: {
          'User-Agent': `CallMolt-Plugin/${PLUGIN_VERSION}`,
        },
      });

      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
      this.ws.on('error', (error) => this.handleError(error));
    } catch (error) {
      this.log('error', 'Failed to create WebSocket connection', error);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the service
   */
  disconnect(): void {
    this.log('info', 'Disconnecting from CallMolt service');
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
    this.activeCalls.clear();
    this.setStatus('disconnected');
    this.emit('disconnected', 'Client initiated disconnect');
  }

  /**
   * Send a response for a transcript
   */
  sendResponse(callId: string, text: string, requestId: string): void {
    if (!this.isConnected()) {
      this.log('warn', 'Cannot send response: not connected');
      return;
    }

    const message: ResponseMessage = {
      type: 'response' as MessageType.RESPONSE,
      callId,
      text,
      requestId,
      timestamp: Date.now(),
    };

    this.send(message);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.log('debug', `Status changed to: ${status}`);
    }
  }

  private handleOpen(): void {
    this.log('info', 'WebSocket connected, authenticating...');
    this.reconnectAttempts = 0;

    // Send authentication
    const authMessage: AuthMessage = {
      type: 'auth' as MessageType.AUTH,
      apiKey: this.config.apiKey,
      pluginVersion: PLUGIN_VERSION,
      timestamp: Date.now(),
    };

    this.send(authMessage);
  }

  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as InboundMessage;
      this.processMessage(message);
    } catch (error) {
      this.log('error', 'Failed to parse message', error);
    }
  }

  private processMessage(message: InboundMessage): void {
    switch (message.type) {
      case 'auth_response':
        this.handleAuthResponse(message);
        break;

      case 'transcript':
        this.handleTranscript(message);
        break;

      case 'call_start':
        this.handleCallStart(message);
        break;

      case 'call_end':
        this.handleCallEnd(message);
        break;

      case 'ping':
        this.handlePing();
        break;

      case 'error':
        this.handleErrorMessage(message);
        break;

      default:
        this.log('warn', `Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  private handleAuthResponse(message: { success: boolean; userId?: string; error?: string }): void {
    if (message.success) {
      this.authenticated = true;
      this.userId = message.userId ?? null;
      this.setStatus('connected');
      this.log('info', `Authenticated successfully (userId: ${this.userId})`);
      this.startPingTimer();
      this.emit('connected');
    } else {
      this.log('error', `Authentication failed: ${message.error}`);
      this.setStatus('error');
      this.emit('error', new Error(`Authentication failed: ${message.error}`));
      // Don't reconnect on auth failure - API key is likely invalid
      this.disconnect();
    }
  }

  private handleTranscript(message: { callId: string; text: string; isFinal: boolean; requestId?: string }): void {
    const { callId, text, isFinal, requestId } = message;
    this.log('debug', `Transcript (${isFinal ? 'final' : 'interim'}): ${text}`);
    this.emit('transcript', callId, text, isFinal);
  }

  private handleCallStart(message: { callId: string; source: 'browser' | 'phone'; callerInfo?: { phoneNumber?: string } }): void {
    const call: ActiveCall = {
      callId: message.callId,
      source: message.source,
      startTime: Date.now(),
      callerInfo: message.callerInfo,
    };
    this.activeCalls.set(message.callId, call);
    this.log('info', `Call started: ${message.callId} (${message.source})`);
    this.emit('callStart', call);
  }

  private handleCallEnd(message: { callId: string; reason: string; duration?: number }): void {
    const { callId, reason, duration } = message;
    this.activeCalls.delete(callId);
    this.log('info', `Call ended: ${callId} (${reason}, ${duration}ms)`);
    this.emit('callEnd', callId, reason, duration);
  }

  private handlePing(): void {
    this.log('debug', 'Received ping, sending pong');
    const pong: PongMessage = {
      type: 'pong' as MessageType.PONG,
      timestamp: Date.now(),
    };
    this.send(pong);
  }

  private handleErrorMessage(message: { code: string; message: string; callId?: string }): void {
    this.log('error', `Server error: ${message.code} - ${message.message}`);
    this.emit('error', new Error(`${message.code}: ${message.message}`));
  }

  private handleClose(code: number, reason: string): void {
    this.log('info', `WebSocket closed: ${code} - ${reason}`);
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
    this.log('error', 'WebSocket error', error);
    this.emit('error', error);
  }

  private send(message: OutboundMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('warn', 'Cannot send message: WebSocket not open');
      return;
    }

    try {
      // Don't log the full auth message (contains API key)
      if (message.type === 'auth') {
        this.log('debug', `Sending: auth (key: ${maskApiKey(this.config.apiKey)})`);
      } else {
        this.log('debug', `Sending: ${message.type}`);
      }
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.log('error', 'Failed to send message', error);
    }
  }

  private scheduleReconnect(): void {
    if (this.config.maxReconnectAttempts > 0 &&
        this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('error', `Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
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

    this.log('info', `Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingTimer(): void {
    this.clearPingTimers();

    this.pingTimer = setInterval(() => {
      if (!this.isConnected()) return;

      this.log('debug', 'Sending ping');
      const ping = { type: 'ping', timestamp: Date.now() };
      this.ws?.send(JSON.stringify(ping));

      // Set timeout for pong response
      this.pingTimeout = setTimeout(() => {
        this.log('warn', 'Ping timeout - reconnecting');
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

  private log(level: string, message: string, ...args: unknown[]): void {
    this.logger(level, message, ...args);
  }
}
