import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { stringEnum } from "openclaw/plugin-sdk";
import { NatsWakeConfigSchema } from "./src/config.ts";
import { createNatsWakeService, type NatsWakeHandle } from "./src/service.ts";
import type { MessagePriority, OutboundMessage } from "./src/types.ts";

const PRIORITIES = ["urgent", "normal", "low"] as const;
const ACTIONS = ["publish", "request"] as const;
const AGENT_SUBJECT_RE = /^agent\.([^.]+)\.inbox$/;

const NatsToolSchema = Type.Object({
  action: stringEnum(ACTIONS, { description: "publish = fire-and-forget, request = wait for reply" }),
  subject: Type.Optional(Type.String({ description: "NATS subject (e.g. 'agent.gizmo.inbox')" })),
  to: Type.Optional(Type.String({ description: "Shorthand: 'gizmo' becomes 'agent.gizmo.inbox'" })),
  message: Type.String({ description: "Message body to send" }),
  priority: Type.Optional(stringEnum(PRIORITIES, { description: "Priority level (default: normal)" })),
  timeoutMs: Type.Optional(Type.Number({ description: "Timeout for request action (default: 5000)" })),
});

function resolveOutboundTo(params: { to: string; subject: string; defaultAgent?: string }): string {
  if (params.to) {
    return params.to;
  }

  const match = AGENT_SUBJECT_RE.exec(params.subject);
  if (match?.[1]) {
    return match[1];
  }

  return params.defaultAgent || "unknown";
}

function createNatsTool(handle: NatsWakeHandle) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return {
    name: "nats",
    label: "NATS",
    description: "Publish messages to NATS subjects for inter-agent communication",
    parameters: NatsToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const config = handle.getConfig();
      const client = handle.getClient();

      if (!config?.enabled) {
        return {
          content: [{ type: "text", text: "NATS plugin is disabled" }],
          details: { error: "disabled" },
        };
      }

      if (!client || !handle.isConnected()) {
        return {
          content: [{ type: "text", text: "Not connected to NATS server" }],
          details: { error: "not_connected" },
        };
      }

      // Resolve subject from 'subject' or 'to'
      let subject = typeof params.subject === "string" ? params.subject.trim() : "";
      const to = typeof params.to === "string" ? params.to.trim() : "";

      if (!subject && to) {
        subject = `agent.${to}.inbox`;
      }

      if (!subject) {
        return {
          content: [{ type: "text", text: "Must provide 'subject' or 'to'" }],
          details: { error: "missing_subject" },
        };
      }

      const message = typeof params.message === "string" ? params.message : "";
      if (!message.trim()) {
        return {
          content: [{ type: "text", text: "Message is required" }],
          details: { error: "missing_message" },
        };
      }

      const action = params.action as (typeof ACTIONS)[number];
      const priority = (params.priority as MessagePriority) || "normal";
      const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 5000;
      const outboundTo = resolveOutboundTo({
        to,
        subject,
        defaultAgent: config.defaultAgent,
      });

      // Build outbound message payload
      const payload: OutboundMessage = {
        from: config.agentName || config.defaultAgent || "unknown",
        to: outboundTo,
        body: message,
        priority,
        metadata: {
          timestamp: new Date().toISOString(),
          source: "nats-tool",
        },
      };

      const data = encoder.encode(JSON.stringify(payload));

      if (action === "publish") {
        try {
          client.publish(subject, data);
          return {
            content: [{ type: "text", text: `Published to ${subject} (priority: ${priority})` }],
            details: { ok: true, subject, priority },
          };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: `Publish failed: ${errorMsg}` }],
            details: { error: errorMsg },
          };
        }
      }

      if (action === "request") {
        try {
          const replyData = await client.request(subject, data, timeoutMs);
          const replyText = decoder.decode(replyData);
          let response: unknown;
          try {
            response = JSON.parse(replyText);
          } catch {
            response = replyText;
          }
          return {
            content: [{ type: "text", text: `Response from ${subject}: ${replyText}` }],
            details: { ok: true, response },
          };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: `Request failed: ${errorMsg}` }],
            details: { error: errorMsg },
          };
        }
      }

      return {
        content: [{ type: "text", text: `Unknown action: ${action}` }],
        details: { error: "unknown_action" },
      };
    },
  };
}

const plugin = {
  id: "nats-wake",
  name: "NATS Wake",
  description: "Wake agents via NATS message bus with priority support",
  configSchema: NatsWakeConfigSchema,
  register(api: OpenClawPluginApi) {
    const { service, handle } = createNatsWakeService(api.runtime);
    api.registerService(service);
    api.registerTool(createNatsTool(handle));
  },
};

export default plugin;
