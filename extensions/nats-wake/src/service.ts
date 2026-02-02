import type {
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginRuntime,
} from "openclaw/plugin-sdk";
import { createActionDispatcher, type ActionDispatcher } from "./actions.ts";
import { createNatsClient, type NatsClient } from "./client.ts";
import { resolveNatsWakeConfig } from "./config.ts";
import type { NatsWakeConfig } from "./types.ts";
import { createMessageProcessor, type MessageProcessor } from "./processor.ts";

type ServiceState = {
  client: NatsClient | null;
  processor: MessageProcessor | null;
  dispatcher: ActionDispatcher | null;
  runtime: PluginRuntime | null;
  config: NatsWakeConfig | null;
};

const PLUGIN_ID = "nats-wake";
const DEFAULT_AGENT = "main";

export type NatsWakeHandle = {
  getClient: () => NatsClient | null;
  getConfig: () => NatsWakeConfig | null;
  isConnected: () => boolean;
};

export type NatsWakeServiceResult = {
  service: OpenClawPluginService;
  handle: NatsWakeHandle;
};

export function createNatsWakeService(runtime: PluginRuntime): NatsWakeServiceResult {
  const state: ServiceState = {
    client: null,
    processor: null,
    dispatcher: null,
    runtime,
    config: null,
  };

  const handle: NatsWakeHandle = {
    getClient: () => state.client,
    getConfig: () => state.config,
    isConnected: () => state.client?.isConnected() ?? false,
  };

  const service: OpenClawPluginService = {
    id: PLUGIN_ID,

    async start(ctx: OpenClawPluginServiceContext): Promise<void> {
      // OpenClaw stores plugin config under plugins.entries[id]
      const rawPluginConfig = ctx.config.plugins?.entries?.[PLUGIN_ID];
      const pluginConfig =
        rawPluginConfig && typeof rawPluginConfig === "object" && !Array.isArray(rawPluginConfig)
          ? (rawPluginConfig as Record<string, unknown>)
          : undefined;
      const config = resolveNatsWakeConfig(pluginConfig?.config ?? pluginConfig);
      const entryEnabled = typeof pluginConfig?.enabled === "boolean" ? pluginConfig.enabled : undefined;
      state.config = {
        ...config,
        enabled: entryEnabled ?? config.enabled,
      };

      if (!config.enabled) {
        ctx.logger.debug?.("nats-wake: plugin disabled");
        return;
      }

      if (!config.url || !config.subjects || config.subjects.length === 0) {
        ctx.logger.warn("nats-wake: enabled but missing url or subjects");
        return;
      }

      const defaultAgent = config.defaultAgent || DEFAULT_AGENT;

      // Create processor
      state.processor = createMessageProcessor({ logger: ctx.logger });

      // Create action dispatcher
      state.dispatcher = createActionDispatcher({
        runtime: state.runtime!,
        logger: ctx.logger,
      });

      // Create NATS client
      state.client = createNatsClient(
        {
          url: config.url,
          subjects: config.subjects,
          credentials: config.credentials,
          reconnect: config.reconnect,
        },
        (msg) => {
          const processed = state.processor?.process(msg, defaultAgent);
          if (processed) {
            state.dispatcher?.dispatch(processed);
          }
        },
        ctx.logger,
      );

      // Start connection (don't await - let it reconnect in background)
      state.client.connect().catch((err) => {
        ctx.logger.warn(`nats-wake: initial connection failed: ${String(err)}`);
      });

      ctx.logger.info(
        `nats-wake: started (url=${config.url}, subjects=${config.subjects.join(", ")})`,
      );
    },

    async stop(ctx: OpenClawPluginServiceContext): Promise<void> {
      if (state.client) {
        await state.client.disconnect();
        state.client = null;
      }

      state.processor = null;
      state.dispatcher = null;

      ctx.logger.info("nats-wake: stopped");
    },
  };

  return { service, handle };
}
