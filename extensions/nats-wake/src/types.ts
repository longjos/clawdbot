export type NatsWakeConfig = {
  enabled?: boolean;
  url?: string;
  subjects?: string[];
  credentials?: {
    token?: string;
    user?: string;
    pass?: string;
  };
  reconnect?: {
    maxAttempts?: number;
    delayMs?: number;
    maxDelayMs?: number;
  };
  defaultAgent?: string;
  agentName?: string;
};

export type MessagePriority = "urgent" | "normal" | "low";

export type InboundMessage = {
  to?: string;
  priority?: MessagePriority;
  from: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type ProcessedMessage = {
  sessionKey: string;
  priority: MessagePriority;
  eventText: string;
  shouldWake: boolean;
};

export type NatsClientConfig = {
  url: string;
  subjects: string[];
  credentials?: {
    token?: string;
    user?: string;
    pass?: string;
  };
  reconnect?: {
    maxAttempts: number;
    delayMs: number;
    maxDelayMs: number;
  };
};

export type NatsMessage = {
  subject: string;
  data: Uint8Array;
};

export type OutboundMessage = {
  from: string;
  to: string;
  body: string;
  priority: MessagePriority;
  metadata?: Record<string, unknown>;
};
