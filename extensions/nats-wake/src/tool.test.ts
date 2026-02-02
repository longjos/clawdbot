import { describe, expect, it, vi } from "vitest";
import type { NatsWakeHandle } from "./service.ts";
import type { NatsWakeConfig } from "./types.ts";

// Import the tool creator from index - we'll test the tool logic
// Since the tool is created inline in index.ts, we'll test by recreating the logic

const AGENT_SUBJECT_RE = /^agent\.([^.]+)\.inbox$/;

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

function createMockHandle(overrides: {
  config?: NatsWakeConfig | null;
  isConnected?: boolean;
  publishFn?: (subject: string, data: Uint8Array) => void;
  requestFn?: (subject: string, data: Uint8Array, timeoutMs: number) => Promise<Uint8Array>;
}): NatsWakeHandle {
  const {
    config = { enabled: true, agentName: "test-agent" },
    isConnected = true,
    publishFn = vi.fn(),
    requestFn = vi.fn().mockResolvedValue(new TextEncoder().encode('{"ok":true}')),
  } = overrides;

  return {
    getConfig: () => config,
    getClient: () =>
      isConnected
        ? {
            connect: vi.fn(),
            disconnect: vi.fn(),
            isConnected: () => true,
            publish: publishFn,
            request: requestFn,
          }
        : null,
    isConnected: () => isConnected,
  };
}

// Recreate the tool execute logic for testing
async function executeNatsTool(
  handle: NatsWakeHandle,
  params: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

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

  const action = params.action as "publish" | "request";
  const priority = (params.priority as "urgent" | "normal" | "low") || "normal";
  const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 5000;
  const outboundTo = resolveOutboundTo({
    to,
    subject,
    defaultAgent: config.defaultAgent,
  });

  const payload = {
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
}

describe("nats tool", () => {
  describe("validation", () => {
    it("returns error when plugin is disabled", async () => {
      const handle = createMockHandle({ config: { enabled: false } });

      const result = await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "hello",
      });

      expect(result.details).toEqual({ error: "disabled" });
    });

    it("returns error when not connected", async () => {
      const handle = createMockHandle({ isConnected: false });

      const result = await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "hello",
      });

      expect(result.details).toEqual({ error: "not_connected" });
    });

    it("returns error when neither subject nor to is provided", async () => {
      const handle = createMockHandle({});

      const result = await executeNatsTool(handle, {
        action: "publish",
        message: "hello",
      });

      expect(result.details).toEqual({ error: "missing_subject" });
    });

    it("returns error when message is empty", async () => {
      const handle = createMockHandle({});

      const result = await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "",
      });

      expect(result.details).toEqual({ error: "missing_message" });
    });

    it("returns error when message is whitespace only", async () => {
      const handle = createMockHandle({});

      const result = await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "   ",
      });

      expect(result.details).toEqual({ error: "missing_message" });
    });
  });

  describe("subject resolution", () => {
    it("uses subject directly when provided", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({ publishFn });

      await executeNatsTool(handle, {
        action: "publish",
        subject: "custom.subject",
        message: "hello",
      });

      expect(publishFn).toHaveBeenCalledWith(
        "custom.subject",
        expect.any(Uint8Array),
      );
    });

    it("uses defaultAgent as outbound to for non-agent subjects", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({
        publishFn,
        config: { enabled: true, defaultAgent: "main" },
      });

      await executeNatsTool(handle, {
        action: "publish",
        subject: "custom.subject",
        message: "hello",
      });

      const sentData = publishFn.mock.calls[0][1];
      const payload = JSON.parse(new TextDecoder().decode(sentData));

      expect(payload.to).toBe("main");
    });

    it("derives outbound to from agent.{name}.inbox subject", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({ publishFn });

      await executeNatsTool(handle, {
        action: "publish",
        subject: "agent.gizmo.inbox",
        message: "hello",
      });

      const sentData = publishFn.mock.calls[0][1];
      const payload = JSON.parse(new TextDecoder().decode(sentData));

      expect(payload.to).toBe("gizmo");
    });

    it("converts to shorthand to agent.{to}.inbox", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({ publishFn });

      await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "hello",
      });

      expect(publishFn).toHaveBeenCalledWith(
        "agent.gizmo.inbox",
        expect.any(Uint8Array),
      );
    });

    it("prefers subject over to when both provided", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({ publishFn });

      await executeNatsTool(handle, {
        action: "publish",
        subject: "explicit.subject",
        to: "gizmo",
        message: "hello",
      });

      expect(publishFn).toHaveBeenCalledWith(
        "explicit.subject",
        expect.any(Uint8Array),
      );
    });
  });

  describe("publish action", () => {
    it("publishes message with correct payload", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({
        config: { enabled: true, agentName: "nyx" },
        publishFn,
      });

      const result = await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "Hello there!",
        priority: "urgent",
      });

      expect(result.details).toEqual({ ok: true, subject: "agent.gizmo.inbox", priority: "urgent" });
      expect(publishFn).toHaveBeenCalledTimes(1);

      const sentData = publishFn.mock.calls[0][1];
      const payload = JSON.parse(new TextDecoder().decode(sentData));

      expect(payload.from).toBe("nyx");
      expect(payload.to).toBe("gizmo");
      expect(payload.body).toBe("Hello there!");
      expect(payload.priority).toBe("urgent");
      expect(payload.metadata.source).toBe("nats-tool");
    });

    it("uses defaultAgent as fallback for from field", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({
        config: { enabled: true, defaultAgent: "main" },
        publishFn,
      });

      await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "Hello",
      });

      const sentData = publishFn.mock.calls[0][1];
      const payload = JSON.parse(new TextDecoder().decode(sentData));

      expect(payload.from).toBe("main");
    });

    it("uses 'unknown' when no agentName or defaultAgent", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({
        config: { enabled: true },
        publishFn,
      });

      await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "Hello",
      });

      const sentData = publishFn.mock.calls[0][1];
      const payload = JSON.parse(new TextDecoder().decode(sentData));

      expect(payload.from).toBe("unknown");
    });

    it("defaults priority to normal", async () => {
      const publishFn = vi.fn();
      const handle = createMockHandle({ publishFn });

      await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "Hello",
      });

      const sentData = publishFn.mock.calls[0][1];
      const payload = JSON.parse(new TextDecoder().decode(sentData));

      expect(payload.priority).toBe("normal");
    });

    it("handles publish errors", async () => {
      const publishFn = vi.fn().mockImplementation(() => {
        throw new Error("Connection lost");
      });
      const handle = createMockHandle({ publishFn });

      const result = await executeNatsTool(handle, {
        action: "publish",
        to: "gizmo",
        message: "Hello",
      });

      expect(result.details).toEqual({ error: "Connection lost" });
    });
  });

  describe("request action", () => {
    it("sends request and returns parsed JSON response", async () => {
      const requestFn = vi.fn().mockResolvedValue(
        new TextEncoder().encode(JSON.stringify({ status: "ok", data: 42 })),
      );
      const handle = createMockHandle({ requestFn });

      const result = await executeNatsTool(handle, {
        action: "request",
        to: "gizmo",
        message: "What is the answer?",
        timeoutMs: 10000,
      });

      expect(result.details).toEqual({ ok: true, response: { status: "ok", data: 42 } });
      expect(requestFn).toHaveBeenCalledWith(
        "agent.gizmo.inbox",
        expect.any(Uint8Array),
        10000,
      );
    });

    it("uses default timeout of 5000ms", async () => {
      const requestFn = vi.fn().mockResolvedValue(
        new TextEncoder().encode("{}"),
      );
      const handle = createMockHandle({ requestFn });

      await executeNatsTool(handle, {
        action: "request",
        to: "gizmo",
        message: "Hello",
      });

      expect(requestFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Uint8Array),
        5000,
      );
    });

    it("handles non-JSON responses as strings", async () => {
      const requestFn = vi.fn().mockResolvedValue(
        new TextEncoder().encode("plain text response"),
      );
      const handle = createMockHandle({ requestFn });

      const result = await executeNatsTool(handle, {
        action: "request",
        to: "gizmo",
        message: "Hello",
      });

      expect(result.details).toEqual({ ok: true, response: "plain text response" });
    });

    it("handles request timeout errors", async () => {
      const requestFn = vi.fn().mockRejectedValue(new Error("REQUEST_TIMEOUT"));
      const handle = createMockHandle({ requestFn });

      const result = await executeNatsTool(handle, {
        action: "request",
        to: "gizmo",
        message: "Hello",
      });

      expect(result.details).toEqual({ error: "REQUEST_TIMEOUT" });
    });
  });
});
