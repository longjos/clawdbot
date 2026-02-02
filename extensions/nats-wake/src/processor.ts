import type { PluginLogger } from "openclaw/plugin-sdk";
import type { InboundMessage, MessagePriority, NatsMessage, ProcessedMessage } from "./types.ts";

export type MessageProcessor = {
  process: (natsMsg: NatsMessage, defaultAgent: string) => ProcessedMessage | null;
};

const VALID_PRIORITIES = new Set<string>(["urgent", "normal", "low"]);

function isValidPriority(value: unknown): value is MessagePriority {
  return typeof value === "string" && VALID_PRIORITIES.has(value);
}

function parseInboundMessage(data: Uint8Array): InboundMessage | null {
  try {
    const text = new TextDecoder().decode(data);
    const parsed = JSON.parse(text) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const msg = parsed as Record<string, unknown>;

    const from = msg.from;
    const body = msg.body;

    if (typeof from !== "string" || !from.trim()) {
      return null;
    }

    if (typeof body !== "string" || !body.trim()) {
      return null;
    }

    return {
      to: typeof msg.to === "string" && msg.to.trim() ? msg.to.trim() : undefined,
      priority: isValidPriority(msg.priority) ? msg.priority : "normal",
      from: from.trim(),
      body: body.trim(),
      metadata:
        typeof msg.metadata === "object" && !Array.isArray(msg.metadata)
          ? (msg.metadata as Record<string, unknown>)
          : undefined,
    };
  } catch {
    return null;
  }
}

function buildSessionKey(agentName: string): string {
  return `agent:${agentName}:main`;
}

function formatEventText(msg: InboundMessage): string {
  const priorityUpper = msg.priority?.toUpperCase() || "NORMAL";
  return `[${priorityUpper} from ${msg.from}] ${msg.body}`;
}

export function createMessageProcessor(opts: { logger: PluginLogger }): MessageProcessor {
  const { logger } = opts;

  return {
    process(natsMsg: NatsMessage, defaultAgent: string): ProcessedMessage | null {
      const inbound = parseInboundMessage(natsMsg.data);

      if (!inbound) {
        logger.debug?.(`nats-wake: invalid message on ${natsMsg.subject}: parse failed`);
        return null;
      }

      const agentName = inbound.to || defaultAgent;
      const sessionKey = buildSessionKey(agentName);
      const priority = inbound.priority;

      const eventText = formatEventText(inbound);
      const shouldWake = priority === "urgent";

      logger.debug?.(
        `nats-wake: processed ${priority} message for ${sessionKey} (wake=${shouldWake})`,
      );

      return {
        sessionKey,
        priority,
        eventText,
        shouldWake,
      };
    },
  };
}
