import { describe, expect, it, vi, beforeEach } from "vitest";
import { createActionDispatcher } from "./actions.ts";
import type { ProcessedMessage } from "./types.ts";
import type { PluginRuntime, PluginLogger } from "openclaw/plugin-sdk";

describe("createActionDispatcher", () => {
  let mockRuntime: {
    system: {
      enqueueSystemEvent: ReturnType<typeof vi.fn>;
      requestHeartbeatNow: ReturnType<typeof vi.fn>;
    };
  };

  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRuntime = {
      system: {
        enqueueSystemEvent: vi.fn(),
        requestHeartbeatNow: vi.fn(),
      },
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  describe("dispatch", () => {
    it("enqueues system event for urgent message", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:gizmo:main",
        priority: "urgent",
        eventText: "[URGENT from alertmanager] Server down",
        shouldWake: true,
      };

      dispatcher.dispatch(msg);

      expect(mockRuntime.system.enqueueSystemEvent).toHaveBeenCalledWith(
        "[URGENT from alertmanager] Server down",
        { sessionKey: "agent:gizmo:main" },
      );
    });

    it("triggers wake for urgent message", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:gizmo:main",
        priority: "urgent",
        eventText: "[URGENT from alertmanager] Server down",
        shouldWake: true,
      };

      dispatcher.dispatch(msg);

      expect(mockRuntime.system.requestHeartbeatNow).toHaveBeenCalledWith({
        reason: "nats-wake:urgent",
      });
    });

    it("enqueues system event for normal message", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:alice:main",
        priority: "normal",
        eventText: "[NORMAL from cron] Daily report",
        shouldWake: false,
      };

      dispatcher.dispatch(msg);

      expect(mockRuntime.system.enqueueSystemEvent).toHaveBeenCalledWith(
        "[NORMAL from cron] Daily report",
        { sessionKey: "agent:alice:main" },
      );
    });

    it("does not trigger wake for normal message", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:alice:main",
        priority: "normal",
        eventText: "[NORMAL from cron] Daily report",
        shouldWake: false,
      };

      dispatcher.dispatch(msg);

      expect(mockRuntime.system.requestHeartbeatNow).not.toHaveBeenCalled();
    });

    it("logs info message after enqueueing", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:test:main",
        priority: "urgent",
        eventText: "Test message",
        shouldWake: true,
      };

      dispatcher.dispatch(msg);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "nats-wake: enqueued urgent message for agent:test:main",
      );
    });

    it("logs debug message after triggering wake", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:test:main",
        priority: "urgent",
        eventText: "Test message",
        shouldWake: true,
      };

      dispatcher.dispatch(msg);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "nats-wake: triggered wake for agent:test:main",
      );
    });

    it("handles error during enqueue gracefully", () => {
      mockRuntime.system.enqueueSystemEvent.mockImplementation(() => {
        throw new Error("Enqueue failed");
      });

      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:test:main",
        priority: "urgent",
        eventText: "Test message",
        shouldWake: true,
      };

      // Should not throw
      expect(() => dispatcher.dispatch(msg)).not.toThrow();

      // Should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("nats-wake: dispatch failed for agent:test:main"),
      );
    });

    it("does not trigger wake if enqueue fails", () => {
      mockRuntime.system.enqueueSystemEvent.mockImplementation(() => {
        throw new Error("Enqueue failed");
      });

      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:test:main",
        priority: "urgent",
        eventText: "Test message",
        shouldWake: true,
      };

      dispatcher.dispatch(msg);

      // Wake should not be triggered if enqueue failed
      expect(mockRuntime.system.requestHeartbeatNow).not.toHaveBeenCalled();
    });
  });

  describe("different session keys", () => {
    it("routes to correct session key", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const sessions = [
        "agent:alice:main",
        "agent:bob:main",
        "agent:production:main",
        "agent:test-agent-123:main",
      ];

      for (const sessionKey of sessions) {
        mockRuntime.system.enqueueSystemEvent.mockClear();

        const msg: ProcessedMessage = {
          sessionKey,
          priority: "normal",
          eventText: "Test message",
          shouldWake: false,
        };

        dispatcher.dispatch(msg);

        expect(mockRuntime.system.enqueueSystemEvent).toHaveBeenCalledWith(
          "Test message",
          { sessionKey },
        );
      }
    });
  });

  describe("priority in wake reason", () => {
    it("includes priority in wake reason", () => {
      const dispatcher = createActionDispatcher({
        runtime: mockRuntime as unknown as PluginRuntime,
        logger: mockLogger as PluginLogger,
      });

      const msg: ProcessedMessage = {
        sessionKey: "agent:test:main",
        priority: "urgent",
        eventText: "Test message",
        shouldWake: true,
      };

      dispatcher.dispatch(msg);

      expect(mockRuntime.system.requestHeartbeatNow).toHaveBeenCalledWith({
        reason: "nats-wake:urgent",
      });
    });
  });
});
