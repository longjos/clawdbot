import { describe, expect, it, vi } from "vitest";
import { createMessageProcessor } from "./processor.ts";
import type { NatsMessage } from "./types.ts";

function createNatsMessage(payload: unknown): NatsMessage {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  return { subject: "agent.test.inbox", data };
}

function createRawNatsMessage(raw: string): NatsMessage {
  const data = new TextEncoder().encode(raw);
  return { subject: "agent.test.inbox", data };
}

describe("createMessageProcessor", () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const processor = createMessageProcessor({ logger: mockLogger });

  describe("valid messages", () => {
    it("processes urgent message with all fields", () => {
      const msg = createNatsMessage({
        to: "gizmo",
        from: "alertmanager",
        body: "Server is down",
        priority: "urgent",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.sessionKey).toBe("agent:gizmo:main");
      expect(result!.priority).toBe("urgent");
      expect(result!.eventText).toBe("[URGENT from alertmanager] Server is down");
      expect(result!.shouldWake).toBe(true);
    });

    it("processes normal message", () => {
      const msg = createNatsMessage({
        to: "alice",
        from: "cron",
        body: "Daily report ready",
        priority: "normal",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.sessionKey).toBe("agent:alice:main");
      expect(result!.priority).toBe("normal");
      expect(result!.eventText).toBe("[NORMAL from cron] Daily report ready");
      expect(result!.shouldWake).toBe(false);
    });

    it("uses default agent when 'to' field is missing", () => {
      const msg = createNatsMessage({
        from: "system",
        body: "Generic notification",
      });

      const result = processor.process(msg, "fallback-agent");

      expect(result).not.toBeNull();
      expect(result!.sessionKey).toBe("agent:fallback-agent:main");
    });

    it("uses default priority (normal) when priority is missing", () => {
      const msg = createNatsMessage({
        to: "bob",
        from: "webhook",
        body: "New event",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.priority).toBe("normal");
      expect(result!.shouldWake).toBe(false);
    });

    it("trims whitespace from to and from fields", () => {
      const msg = createNatsMessage({
        to: "  agent-name  ",
        from: "  sender  ",
        body: "Message",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.sessionKey).toBe("agent:agent-name:main");
      expect(result!.eventText).toContain("from sender]");
    });

    it("preserves metadata as object", () => {
      const msg = createNatsMessage({
        to: "test",
        from: "source",
        body: "Message",
        metadata: { key: "value", nested: { a: 1 } },
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
    });
  });

  describe("low priority messages", () => {
    it("queues low priority messages without waking", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "logger",
        body: "Debug info",
        priority: "low",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.priority).toBe("low");
      expect(result!.shouldWake).toBe(false);
    });
  });

  describe("invalid messages", () => {
    it("returns null for invalid JSON", () => {
      const msg = createRawNatsMessage("not valid json");

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("returns null for empty JSON", () => {
      const msg = createRawNatsMessage("");

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("returns null for array payload", () => {
      const msg = createRawNatsMessage("[]");

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("returns null for null payload", () => {
      const msg = createRawNatsMessage("null");

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("returns null when from field is missing", () => {
      const msg = createNatsMessage({
        to: "agent",
        body: "Message without sender",
      });

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("returns null when from field is empty string", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "   ",
        body: "Message",
      });

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("returns null when body field is missing", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "sender",
      });

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("returns null when body field is empty string", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "sender",
        body: "   ",
      });

      const result = processor.process(msg, "main");

      expect(result).toBeNull();
    });

    it("treats invalid priority as normal", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "sender",
        body: "Message",
        priority: "invalid",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.priority).toBe("normal");
    });

    it("rejects array metadata", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "sender",
        body: "Message",
        metadata: ["not", "an", "object"],
      });

      const result = processor.process(msg, "main");

      // Should still process, just ignore invalid metadata
      expect(result).not.toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles very long body text", () => {
      const longBody = "a".repeat(10000);
      const msg = createNatsMessage({
        to: "agent",
        from: "sender",
        body: longBody,
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.eventText).toContain(longBody);
    });

    it("handles special characters in body", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "sender",
        body: "Message with special chars: <>&\"'`${}\n\t",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.eventText).toContain("<>&");
    });

    it("handles unicode in body", () => {
      const msg = createNatsMessage({
        to: "agent",
        from: "sender",
        body: "Unicode: 你好世界 🚀 émojis",
      });

      const result = processor.process(msg, "main");

      expect(result).not.toBeNull();
      expect(result!.eventText).toContain("你好世界");
      expect(result!.eventText).toContain("🚀");
    });
  });
});
