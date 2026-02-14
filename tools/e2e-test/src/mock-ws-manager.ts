/**
 * Mock WebSocket server implementing the plugin-facing side of the ws-manager protocol.
 *
 * Reference: crabcallr/ws-manager/src/connections/plugin.ts
 */

import { EventEmitter } from "events";
import { createServer, type IncomingMessage, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type {
  CallSource,
  ManagerToPluginMessage,
  PluginToManagerMessage,
} from "./types.js";
import * as log from "./logger.js";

const AUTH_TIMEOUT_MS = 10_000;

export class MockWsManager extends EventEmitter {
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private pluginWs: WebSocket | null = null;
  private authenticated = false;
  private receivedMessages: PluginToManagerMessage[] = [];
  private connectionResolvers: Array<() => void> = [];
  private messageWaiters: Array<{
    type: string;
    requestId?: string;
    resolve: (msg: PluginToManagerMessage) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  // ---- Lifecycle ----

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });

      this.wss = new WebSocketServer({ server: this.httpServer, path: "/plugin" });

      this.wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
        log.debug("Mock ws-manager: plugin WebSocket connected");

        if (this.pluginWs) {
          log.warn("Mock ws-manager: replacing existing plugin connection");
          this.pluginWs.removeAllListeners();
          this.pluginWs.close(1000, "Replaced by new connection");
        }

        this.pluginWs = ws;
        this.authenticated = false;

        const authTimeout = setTimeout(() => {
          if (!this.authenticated) {
            log.warn("Mock ws-manager: auth timeout, closing connection");
            ws.close(4001, "Authentication timeout");
          }
        }, AUTH_TIMEOUT_MS);

        ws.on("message", (data: Buffer) => {
          let message: PluginToManagerMessage;
          try {
            message = JSON.parse(data.toString()) as PluginToManagerMessage;
          } catch {
            log.error("Mock ws-manager: invalid JSON from plugin");
            ws.close(4002, "Invalid message format");
            return;
          }

          log.debug(`Mock ws-manager: received ${message.type}`);
          this.receivedMessages.push(message);

          // Handle auth
          if (message.type === "auth") {
            clearTimeout(authTimeout);
            if (message.apiKey.startsWith("cc_")) {
              this.authenticated = true;
              this.sendToPlugin({
                type: "auth_result",
                success: true,
                userId: "e2e-test-user",
              });
              log.debug("Mock ws-manager: plugin authenticated");
              this.emit("authenticated");

              // Resolve any pending waitForConnection calls
              for (const resolve of this.connectionResolvers) {
                resolve();
              }
              this.connectionResolvers = [];
            } else {
              this.sendToPlugin({
                type: "auth_result",
                success: false,
                error: "Invalid API key format",
              });
              ws.close(4003, "Authentication failed");
            }
            this.notifyWaiters(message);
            return;
          }

          // Handle ping from plugin
          if (message.type === "ping") {
            this.sendToPlugin({ type: "pong" });
            this.notifyWaiters(message);
            return;
          }

          // Handle filler from plugin (just log and notify waiters)
          if (message.type === "filler") {
            log.debug(`Mock ws-manager: received filler for ${message.requestId}: "${message.text}"`);
            this.notifyWaiters(message);
            return;
          }

          // Handle speak from plugin (just log and notify waiters)
          if (message.type === "speak") {
            log.debug(`Mock ws-manager: received speak for ${message.callId}: "${message.text}" (endCall=${message.endCall ?? false})`);
            this.notifyWaiters(message);
            return;
          }

          // Notify any waiters
          this.notifyWaiters(message);
        });

        ws.on("close", (code: number, reason: Buffer) => {
          log.debug(`Mock ws-manager: plugin disconnected (${code} ${reason.toString()})`);
          clearTimeout(authTimeout);
          if (this.pluginWs === ws) {
            this.pluginWs = null;
            this.authenticated = false;
          }
          this.emit("disconnected", code, reason.toString());
        });

        ws.on("error", (err: Error) => {
          log.debug(`Mock ws-manager: plugin error: ${err.message}`);
        });

        this.emit("connection");
      });

      this.httpServer.listen(port, () => {
        log.info(`Mock ws-manager listening on port ${port}`);
        resolve();
      });

      this.httpServer.on("error", (err) => {
        reject(err);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Reject all pending waiters
      for (const waiter of this.messageWaiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Mock ws-manager shutting down"));
      }
      this.messageWaiters = [];

      if (this.pluginWs) {
        this.pluginWs.close(1000, "Server shutting down");
        this.pluginWs = null;
      }

      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }

      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // ---- Test API ----

  waitForConnection(timeoutMs: number): Promise<void> {
    if (this.authenticated) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.connectionResolvers.push(resolve);

      const timer = setTimeout(() => {
        const idx = this.connectionResolvers.indexOf(resolve);
        if (idx >= 0) this.connectionResolvers.splice(idx, 1);
        reject(new Error(`Plugin did not connect within ${timeoutMs}ms`));
      }, timeoutMs);

      // If already authenticated by the time this runs, clean up timer
      if (this.authenticated) {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  sendCallStart(callId: string, source: CallSource): void {
    this.sendToPlugin({ type: "call_start", callId, source });
  }

  sendRequest(requestId: string, text: string, callId: string): void {
    this.sendToPlugin({ type: "request", requestId, text, callId });
  }

  sendCallEnd(callId: string, durationSeconds: number, source: CallSource): void {
    this.sendToPlugin({
      type: "call_end",
      callId,
      durationSeconds,
      source,
      startedAt: Date.now() - durationSeconds * 1000,
    });
  }

  sendPing(): void {
    this.sendToPlugin({ type: "pong" });
  }

  sendError(code: string, message: string): void {
    this.sendToPlugin({ type: "error", code, message });
  }

  waitForMessage(type: string, timeoutMs: number): Promise<PluginToManagerMessage> {
    // Check already-received messages
    const existing = this.receivedMessages.find((m) => m.type === type);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.messageWaiters.findIndex((w) => w === waiter);
        if (idx >= 0) this.messageWaiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for message type "${type}" (${timeoutMs}ms)`));
      }, timeoutMs);

      const waiter = { type, resolve, reject, timer };
      this.messageWaiters.push(waiter);
    });
  }

  waitForResponse(requestId: string, timeoutMs: number): Promise<PluginToManagerMessage> {
    // Check already-received messages
    const existing = this.receivedMessages.find(
      (m) => m.type === "response" && "requestId" in m && m.requestId === requestId,
    );
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.messageWaiters.findIndex((w) => w === waiter);
        if (idx >= 0) this.messageWaiters.splice(idx, 1);
        reject(new Error(`Timeout waiting for response to request "${requestId}" (${timeoutMs}ms)`));
      }, timeoutMs);

      const waiter = { type: "response", requestId, resolve, reject, timer };
      this.messageWaiters.push(waiter);
    });
  }

  getReceivedMessages(): PluginToManagerMessage[] {
    return [...this.receivedMessages];
  }

  clearReceivedMessages(): void {
    this.receivedMessages = [];
  }

  isConnected(): boolean {
    return this.authenticated && this.pluginWs !== null && this.pluginWs.readyState === WebSocket.OPEN;
  }

  // ---- Internal ----

  private sendToPlugin(message: ManagerToPluginMessage): void {
    if (!this.pluginWs || this.pluginWs.readyState !== WebSocket.OPEN) {
      log.warn(`Mock ws-manager: cannot send ${message.type} - plugin not connected`);
      return;
    }
    log.debug(`Mock ws-manager: sending ${message.type}`);
    this.pluginWs.send(JSON.stringify(message));
  }

  private notifyWaiters(message: PluginToManagerMessage): void {
    const matched: number[] = [];

    for (let i = 0; i < this.messageWaiters.length; i++) {
      const waiter = this.messageWaiters[i];
      if (waiter.type !== message.type) continue;

      // For response messages, also match requestId if specified
      if (waiter.requestId && message.type === "response" && "requestId" in message) {
        if (message.requestId !== waiter.requestId) continue;
      }

      clearTimeout(waiter.timer);
      waiter.resolve(message);
      matched.push(i);
    }

    // Remove matched waiters in reverse order to preserve indices
    for (let i = matched.length - 1; i >= 0; i--) {
      this.messageWaiters.splice(matched[i], 1);
    }
  }
}
