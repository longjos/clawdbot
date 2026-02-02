import type { OpenClawPluginConfigSchema } from "openclaw/plugin-sdk";
import type { NatsWakeConfig } from "./types.ts";

type Issue = { path: Array<string | number>; message: string };

export const NatsWakeConfigSchema: OpenClawPluginConfigSchema = {
  safeParse(value: unknown) {
    const issues: Issue[] = [];

    if (value === undefined) {
      return { success: true, data: undefined };
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        success: false,
        error: { issues: [{ path: [], message: "expected config object" }] },
      };
    }

    const cfg = value as Record<string, unknown>;

    if (cfg.enabled !== undefined && typeof cfg.enabled !== "boolean") {
      issues.push({ path: ["enabled"], message: "must be boolean" });
    }

    if (cfg.enabled === true) {
      const url = cfg.url;
      if (typeof url !== "string" || !url.trim()) {
        issues.push({ path: ["url"], message: "required when enabled" });
      } else if (!/^(nats|ws|wss|tls):\/\/.+/.test(url)) {
        issues.push({
          path: ["url"],
          message: "must be valid NATS URL (nats://, ws://, wss://, tls://)",
        });
      }

      const subjects = cfg.subjects;
      if (!Array.isArray(subjects) || subjects.length === 0) {
        issues.push({ path: ["subjects"], message: "must be non-empty array" });
      } else if (!subjects.every((s) => typeof s === "string" && s.trim())) {
        issues.push({ path: ["subjects"], message: "all subjects must be non-empty strings" });
      }
    }

    if (cfg.credentials !== undefined) {
      if (!cfg.credentials || typeof cfg.credentials !== "object" || Array.isArray(cfg.credentials)) {
        issues.push({ path: ["credentials"], message: "must be object" });
      }
    }

    if (cfg.reconnect !== undefined) {
      if (!cfg.reconnect || typeof cfg.reconnect !== "object" || Array.isArray(cfg.reconnect)) {
        issues.push({ path: ["reconnect"], message: "must be object" });
      } else {
        const reconnect = cfg.reconnect as Record<string, unknown>;
        if (reconnect.delayMs !== undefined && typeof reconnect.delayMs !== "number") {
          issues.push({ path: ["reconnect", "delayMs"], message: "must be number" });
        }
        if (reconnect.maxDelayMs !== undefined) {
          if (typeof reconnect.maxDelayMs !== "number") {
            issues.push({ path: ["reconnect", "maxDelayMs"], message: "must be number" });
          } else if (
            typeof reconnect.delayMs === "number" &&
            reconnect.maxDelayMs < reconnect.delayMs
          ) {
            issues.push({ path: ["reconnect", "maxDelayMs"], message: "must be >= delayMs" });
          }
        }
        if (reconnect.maxAttempts !== undefined && typeof reconnect.maxAttempts !== "number") {
          issues.push({ path: ["reconnect", "maxAttempts"], message: "must be number" });
        }
      }
    }

    if (cfg.defaultAgent !== undefined && typeof cfg.defaultAgent !== "string") {
      issues.push({ path: ["defaultAgent"], message: "must be string" });
    }

    if (cfg.agentName !== undefined && typeof cfg.agentName !== "string") {
      issues.push({ path: ["agentName"], message: "must be string" });
    }

    return issues.length > 0
      ? { success: false, error: { issues } }
      : { success: true, data: value };
  },

  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean", description: "Enable NATS wake plugin" },
      url: { type: "string", description: "NATS server URL (nats://host:port)" },
      subjects: {
        type: "array",
        items: { type: "string" },
        description: "NATS subjects to subscribe (supports wildcards)",
      },
      credentials: {
        type: "object",
        properties: {
          token: { type: "string", description: "NATS authentication token" },
          user: { type: "string", description: "NATS username" },
          pass: { type: "string", description: "NATS password" },
        },
      },
      reconnect: {
        type: "object",
        properties: {
          maxAttempts: { type: "number", description: "Max reconnect attempts (-1 = infinite)" },
          delayMs: { type: "number", description: "Initial reconnect delay (ms)" },
          maxDelayMs: { type: "number", description: "Max reconnect delay (ms)" },
        },
      },
      defaultAgent: { type: "string", description: "Default agent for messages without 'to' field" },
      agentName: { type: "string", description: "This agent's name for outgoing message 'from' field" },
    },
  },

  uiHints: {
    enabled: { label: "Enabled", help: "Enable NATS wake plugin" },
    url: { label: "NATS URL", placeholder: "nats://localhost:4222" },
    subjects: { label: "Subjects", help: "Patterns like agent.*.inbox (wildcards supported)" },
    "credentials.token": { label: "Token", sensitive: true },
    "credentials.user": { label: "Username" },
    "credentials.pass": { label: "Password", sensitive: true },
    "reconnect.maxAttempts": { label: "Max Reconnect Attempts", advanced: true },
    "reconnect.delayMs": { label: "Reconnect Delay (ms)", advanced: true },
    "reconnect.maxDelayMs": { label: "Max Reconnect Delay (ms)", advanced: true },
    defaultAgent: { label: "Default Agent", placeholder: "main", advanced: true },
    agentName: { label: "Agent Name", placeholder: "nyx", help: "Used as 'from' in outgoing messages" },
  },
};

export function resolveNatsWakeConfig(pluginConfig?: unknown): NatsWakeConfig {
  if (!pluginConfig || typeof pluginConfig !== "object") {
    return { enabled: false };
  }

  const cfg = pluginConfig as Record<string, unknown>;

  return {
    enabled: cfg.enabled === true,
    url: typeof cfg.url === "string" ? cfg.url.trim() : undefined,
    subjects: Array.isArray(cfg.subjects)
      ? cfg.subjects.filter((s): s is string => typeof s === "string" && !!s.trim())
      : undefined,
    credentials:
      cfg.credentials && typeof cfg.credentials === "object" && !Array.isArray(cfg.credentials)
        ? (cfg.credentials as NatsWakeConfig["credentials"])
        : undefined,
    reconnect:
      cfg.reconnect && typeof cfg.reconnect === "object" && !Array.isArray(cfg.reconnect)
        ? (cfg.reconnect as NatsWakeConfig["reconnect"])
        : undefined,
    defaultAgent: typeof cfg.defaultAgent === "string" ? cfg.defaultAgent.trim() : undefined,
    agentName: typeof cfg.agentName === "string" ? cfg.agentName.trim() : undefined,
  };
}
