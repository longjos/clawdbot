import { describe, expect, it } from "vitest";
import { NatsWakeConfigSchema, resolveNatsWakeConfig } from "./config.ts";

describe("NatsWakeConfigSchema", () => {
  describe("safeParse", () => {
    it("accepts undefined config", () => {
      const result = NatsWakeConfigSchema.safeParse?.(undefined);

      expect(result?.success).toBe(true);
    });

    it("accepts valid enabled config", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
      });

      expect(result?.success).toBe(true);
    });

    it("accepts disabled config without url/subjects", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: false,
      });

      expect(result?.success).toBe(true);
    });

    it("accepts config with all optional fields", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox", "system.>"],
        credentials: {
          token: "secret-token",
        },
        reconnect: {
          maxAttempts: 10,
          delayMs: 1000,
          maxDelayMs: 30000,
        },
        defaultAgent: "main",
      });

      expect(result?.success).toBe(true);
    });

    it("accepts tls:// URL scheme", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "tls://secure.nats.io:4222",
        subjects: ["agent.*.inbox"],
      });

      expect(result?.success).toBe(true);
    });

    it("accepts ws:// URL scheme", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "ws://nats.example.com:8080",
        subjects: ["agent.*.inbox"],
      });

      expect(result?.success).toBe(true);
    });

    it("accepts wss:// URL scheme", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "wss://nats.example.com:443",
        subjects: ["agent.*.inbox"],
      });

      expect(result?.success).toBe(true);
    });

    it("rejects non-object config", () => {
      const result = NatsWakeConfigSchema.safeParse?.("not an object");

      expect(result?.success).toBe(false);
      expect(result?.error?.issues?.[0]?.message).toBe("expected config object");
    });

    it("rejects array config", () => {
      const result = NatsWakeConfigSchema.safeParse?.([]);

      expect(result?.success).toBe(false);
      expect(result?.error?.issues?.[0]?.message).toBe("expected config object");
    });

    it("rejects enabled config without url", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        subjects: ["agent.*.inbox"],
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["url"], message: "required when enabled" }),
      );
    });

    it("rejects enabled config without subjects", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["subjects"], message: "must be non-empty array" }),
      );
    });

    it("rejects empty subjects array", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: [],
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["subjects"], message: "must be non-empty array" }),
      );
    });

    it("rejects subjects with empty strings", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["valid", ""],
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({
          path: ["subjects"],
          message: "all subjects must be non-empty strings",
        }),
      );
    });

    it("rejects invalid URL scheme", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "http://localhost:4222",
        subjects: ["agent.*.inbox"],
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({
          path: ["url"],
          message: "must be valid NATS URL (nats://, ws://, wss://, tls://)",
        }),
      );
    });

    it("rejects non-boolean enabled", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: "true",
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["enabled"], message: "must be boolean" }),
      );
    });

    it("rejects non-object credentials", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        credentials: "not-an-object",
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["credentials"], message: "must be object" }),
      );
    });

    it("rejects null credentials", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        credentials: null,
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["credentials"], message: "must be object" }),
      );
    });

    it("rejects non-number delayMs", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        reconnect: {
          delayMs: "1000",
        },
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["reconnect", "delayMs"], message: "must be number" }),
      );
    });

    it("rejects null reconnect", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        reconnect: null,
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["reconnect"], message: "must be object" }),
      );
    });

    it("rejects maxDelayMs less than delayMs", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        reconnect: {
          delayMs: 5000,
          maxDelayMs: 1000,
        },
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["reconnect", "maxDelayMs"], message: "must be >= delayMs" }),
      );
    });

    it("rejects non-string defaultAgent", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        defaultAgent: 123,
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["defaultAgent"], message: "must be string" }),
      );
    });

    it("accepts agentName string", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        agentName: "nyx",
      });

      expect(result?.success).toBe(true);
    });

    it("rejects non-string agentName", () => {
      const result = NatsWakeConfigSchema.safeParse?.({
        enabled: true,
        url: "nats://localhost:4222",
        subjects: ["agent.*.inbox"],
        agentName: 123,
      });

      expect(result?.success).toBe(false);
      expect(result?.error?.issues).toContainEqual(
        expect.objectContaining({ path: ["agentName"], message: "must be string" }),
      );
    });
  });
});

describe("resolveNatsWakeConfig", () => {
  it("returns disabled config for undefined input", () => {
    const result = resolveNatsWakeConfig(undefined);

    expect(result.enabled).toBe(false);
  });

  it("returns disabled config for null input", () => {
    const result = resolveNatsWakeConfig(null);

    expect(result.enabled).toBe(false);
  });

  it("returns disabled config for non-object input", () => {
    const result = resolveNatsWakeConfig("string");

    expect(result.enabled).toBe(false);
  });

  it("resolves enabled config correctly", () => {
    const result = resolveNatsWakeConfig({
      enabled: true,
      url: "nats://localhost:4222",
      subjects: ["agent.*.inbox"],
    });

    expect(result.enabled).toBe(true);
    expect(result.url).toBe("nats://localhost:4222");
    expect(result.subjects).toEqual(["agent.*.inbox"]);
  });

  it("trims url whitespace", () => {
    const result = resolveNatsWakeConfig({
      enabled: true,
      url: "  nats://localhost:4222  ",
      subjects: ["agent.*.inbox"],
    });

    expect(result.url).toBe("nats://localhost:4222");
  });

  it("filters invalid subjects", () => {
    const result = resolveNatsWakeConfig({
      enabled: true,
      url: "nats://localhost:4222",
      subjects: ["valid", "", "  ", "also-valid", null, 123],
    });

    expect(result.subjects).toEqual(["valid", "also-valid"]);
  });

  it("trims defaultAgent whitespace", () => {
    const result = resolveNatsWakeConfig({
      enabled: true,
      url: "nats://localhost:4222",
      subjects: ["agent.*.inbox"],
      defaultAgent: "  main  ",
    });

    expect(result.defaultAgent).toBe("main");
  });

  it("preserves credentials object", () => {
    const result = resolveNatsWakeConfig({
      enabled: true,
      url: "nats://localhost:4222",
      subjects: ["agent.*.inbox"],
      credentials: {
        token: "secret",
      },
    });

    expect(result.credentials).toEqual({ token: "secret" });
  });

  it("preserves reconnect object", () => {
    const result = resolveNatsWakeConfig({
      enabled: true,
      url: "nats://localhost:4222",
      subjects: ["agent.*.inbox"],
      reconnect: {
        maxAttempts: 5,
        delayMs: 2000,
        maxDelayMs: 60000,
      },
    });

    expect(result.reconnect).toEqual({
      maxAttempts: 5,
      delayMs: 2000,
      maxDelayMs: 60000,
    });
  });

  it("trims agentName whitespace", () => {
    const result = resolveNatsWakeConfig({
      enabled: true,
      url: "nats://localhost:4222",
      subjects: ["agent.*.inbox"],
      agentName: "  nyx  ",
    });

    expect(result.agentName).toBe("nyx");
  });
});
