import type { PluginLogger } from "openclaw/plugin-sdk";
import type { NatsClientConfig, NatsMessage } from "./types.ts";

export type NatsClient = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: () => boolean;
  publish: (subject: string, data: Uint8Array) => void;
  request: (subject: string, data: Uint8Array, timeoutMs: number) => Promise<Uint8Array>;
};

type NatsClientState = {
  nc: import("nats").NatsConnection | null;
  subs: import("nats").Subscription[];
  reconnectAttempt: number;
  reconnectTimer: NodeJS.Timeout | null;
  stopping: boolean;
};

const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000;
const DEFAULT_RECONNECT_MAX_ATTEMPTS = -1; // infinite

export function createNatsClient(
  config: NatsClientConfig,
  onMessage: (msg: NatsMessage) => void,
  logger: PluginLogger,
): NatsClient {
  const reconnectConfig = {
    maxAttempts: config.reconnect?.maxAttempts ?? DEFAULT_RECONNECT_MAX_ATTEMPTS,
    delayMs: config.reconnect?.delayMs ?? DEFAULT_RECONNECT_DELAY_MS,
    maxDelayMs: config.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
  };

  const state: NatsClientState = {
    nc: null,
    subs: [],
    reconnectAttempt: 0,
    reconnectTimer: null,
    stopping: false,
  };

  function calculateBackoff(attempt: number): number {
    const delay = reconnectConfig.delayMs * Math.pow(2, attempt);
    return Math.min(delay, reconnectConfig.maxDelayMs);
  }

  async function subscribe(): Promise<void> {
    if (!state.nc) {
      return;
    }

    state.subs = [];

    for (const subject of config.subjects) {
      const sub = state.nc.subscribe(subject);
      state.subs.push(sub);

      (async () => {
        for await (const msg of sub) {
          if (state.stopping) {
            break;
          }
          try {
            onMessage({
              subject: msg.subject,
              data: msg.data,
            });
          } catch (err) {
            logger.error(`nats-wake: message handler error: ${String(err)}`);
          }
        }
      })().catch((err) => {
        if (!state.stopping) {
          logger.warn(`nats-wake: subscription ended: ${String(err)}`);
        }
      });

      logger.debug?.(`nats-wake: subscribed to ${subject}`);
    }
  }

  function scheduleReconnect(): void {
    if (state.stopping) {
      return;
    }

    if (
      reconnectConfig.maxAttempts >= 0 &&
      state.reconnectAttempt >= reconnectConfig.maxAttempts
    ) {
      logger.error(
        `nats-wake: max reconnect attempts (${reconnectConfig.maxAttempts}) reached, giving up`,
      );
      return;
    }

    const delay = calculateBackoff(state.reconnectAttempt);
    logger.info(`nats-wake: reconnecting in ${delay}ms (attempt ${state.reconnectAttempt + 1})`);

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      state.reconnectAttempt++;
      doConnect().catch(() => {
        // Error already logged in doConnect
      });
    }, delay);
  }

  async function doConnect(): Promise<void> {
    if (state.stopping) {
      return;
    }

    try {
      const { connect } = await import("nats");

      const connectOpts: import("nats").ConnectionOptions = {
        servers: config.url,
        reconnect: false, // we handle reconnection ourselves
      };

      if (config.credentials?.token) {
        connectOpts.token = config.credentials.token;
      } else if (config.credentials?.user && config.credentials?.pass) {
        connectOpts.user = config.credentials.user;
        connectOpts.pass = config.credentials.pass;
      }

      state.nc = await connect(connectOpts);
      state.reconnectAttempt = 0;

      logger.info(`nats-wake: connected to ${config.url}`);

      // Set up disconnect handler
      (async () => {
        if (!state.nc) {
          return;
        }
        const reason = await state.nc.closed();
        if (!state.stopping) {
          logger.warn(`nats-wake: connection closed: ${reason?.message || "unknown"}`);
          state.nc = null;
          // Note: don't clear state.subs here - disconnect() handles cleanup
          scheduleReconnect();
        }
      })().catch(() => {});

      await subscribe();
    } catch (err) {
      logger.warn(`nats-wake: connection failed: ${String(err)}`);
      state.nc = null;
      scheduleReconnect();
    }
  }

  return {
    async connect(): Promise<void> {
      state.stopping = false;
      await doConnect();
    },

    async disconnect(): Promise<void> {
      state.stopping = true;

      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }

      for (const sub of state.subs) {
        try {
          sub.unsubscribe();
        } catch {
          // ignore
        }
      }
      state.subs = [];

      if (state.nc) {
        try {
          await state.nc.drain();
        } catch {
          try {
            await state.nc.close();
          } catch {
            // ignore
          }
        }
        state.nc = null;
      }

      logger.info("nats-wake: disconnected");
    },

    isConnected(): boolean {
      return state.nc !== null && !state.nc.isClosed();
    },

    publish(subject: string, data: Uint8Array): void {
      if (!state.nc || state.nc.isClosed()) {
        throw new Error("Not connected to NATS");
      }
      state.nc.publish(subject, data);
    },

    async request(subject: string, data: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
      if (!state.nc || state.nc.isClosed()) {
        throw new Error("Not connected to NATS");
      }
      const reply = await state.nc.request(subject, data, { timeout: timeoutMs });
      return reply.data;
    },
  };
}
