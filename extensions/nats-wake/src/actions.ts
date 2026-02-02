import type { PluginLogger, PluginRuntime } from "openclaw/plugin-sdk";
import type { ProcessedMessage } from "./types.ts";

export type ActionDispatcher = {
  dispatch: (msg: ProcessedMessage) => void;
};

export type ActionDispatcherConfig = {
  runtime: PluginRuntime;
  logger: PluginLogger;
};

export function createActionDispatcher(config: ActionDispatcherConfig): ActionDispatcher {
  const { runtime, logger } = config;

  return {
    dispatch(msg: ProcessedMessage): void {
      try {
        runtime.system.enqueueSystemEvent(msg.eventText, { sessionKey: msg.sessionKey });
        logger.info(`nats-wake: enqueued ${msg.priority} message for ${msg.sessionKey}`);

        if (msg.shouldWake) {
          runtime.system.requestHeartbeatNow({ reason: `nats-wake:${msg.priority}` });
          logger.debug?.(`nats-wake: triggered wake for ${msg.sessionKey}`);
        }
      } catch (err) {
        logger.error(`nats-wake: dispatch failed for ${msg.sessionKey}: ${String(err)}`);
      }
    },
  };
}
