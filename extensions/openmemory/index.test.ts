/**
 * OpenMemory Plugin Tests
 *
 * Tests the OpenMemory plugin functionality including:
 * - Plugin registration and configuration
 * - Client methods with mocked fetch
 * - Tool registration for various features
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

describe("openmemory plugin", () => {
  test("plugin registers and initializes correctly", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    expect(openmemoryPlugin.id).toBe("openmemory");
    expect(openmemoryPlugin.name).toBe("OpenMemory");
    expect(openmemoryPlugin.kind).toBe("memory");
    expect(openmemoryPlugin.configSchema).toBeDefined();
    // oxlint-disable-next-line typescript/unbound-method
    expect(openmemoryPlugin.register).toBeInstanceOf(Function);
  });

  test("plugin requires API key", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    const logs: string[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        // No API key
      },
      logger: {
        info: (msg: string) => logs.push(`[info] ${msg}`),
        warn: (msg: string) => logs.push(`[warn] ${msg}`),
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    expect(logs.some((l) => l.includes("No API key configured"))).toBe(true);
  });

  test("plugin registers base tools", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    const toolNames = registeredTools.map((t) => t.name);
    expect(toolNames).toContain("openmemory_search");
    expect(toolNames).toContain("openmemory_add");
    expect(toolNames).toContain("openmemory_reinforce");
    expect(toolNames).toContain("openmemory_update");
    expect(toolNames).toContain("openmemory_delete");
  });

  test("plugin registers temporal tools when enabled", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
        temporal: { enabled: true },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    const toolNames = registeredTools.map((t) => t.name);
    expect(toolNames).toContain("openmemory_temporal_store");
    expect(toolNames).toContain("openmemory_temporal_query");
    expect(toolNames).toContain("openmemory_timeline");
  });

  test("plugin registers graph tools when enabled", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
        graph: { enabled: true },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    const toolNames = registeredTools.map((t) => t.name);
    expect(toolNames).toContain("openmemory_graph_traverse");
    expect(toolNames).toContain("openmemory_extract_entities");
  });

  test("plugin registers sector tools when enabled", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
        sectors: { enabled: true },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    const toolNames = registeredTools.map((t) => t.name);
    expect(toolNames).toContain("openmemory_add_sector");
    expect(toolNames).toContain("openmemory_search_sectors");
  });

  test("plugin registers compression tools when enabled", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
        compression: { autoCompress: true },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    const toolNames = registeredTools.map((t) => t.name);
    expect(toolNames).toContain("openmemory_compress");
    expect(toolNames).toContain("openmemory_compression_stats");
  });

  test("plugin registers before_agent_start hook when autoRecall enabled", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredHooks: Record<string, any[]> = {};
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: true,
        autoCapture: false,
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      on: (hookName: string, handler: any) => {
        if (!registeredHooks[hookName]) {
          registeredHooks[hookName] = [];
        }
        registeredHooks[hookName].push(handler);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    expect(registeredHooks.before_agent_start?.length).toBe(1);
  });

  test("plugin registers agent_end hook when autoCapture enabled", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredHooks: Record<string, any[]> = {};
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: true,
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      on: (hookName: string, handler: any) => {
        if (!registeredHooks[hookName]) {
          registeredHooks[hookName] = [];
        }
        registeredHooks[hookName].push(handler);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    expect(registeredHooks.agent_end?.length).toBe(1);
  });
});

describe("openmemory client methods with mocked fetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("search tool calls query endpoint", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          query: "test query",
          matches: [
            {
              id: "mem-1",
              content: "Test memory content",
              score: 0.95,
              primary_sector: "semantic",
              salience: 0.8,
            },
          ],
        }),
    });

    const searchTool = registeredTools.find((t) => t.name === "openmemory_search");
    const result = await searchTool.execute("call-1", { query: "test query", limit: 5 });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8070/memory/query",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-API-Key": "test-key",
        }),
      }),
    );

    expect(result.content[0].text).toContain("mem-1");
    expect(result.content[0].text).toContain("Test memory content");
  });

  test("add tool calls add endpoint", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "new-mem-1",
          primary_sector: "semantic",
          sectors: ["semantic"],
          chunks: 1,
        }),
    });

    const addTool = registeredTools.find((t) => t.name === "openmemory_add");
    const result = await addTool.execute("call-1", {
      content: "Remember this important fact",
      tags: ["important"],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8070/memory/add",
      expect.objectContaining({
        method: "POST",
      }),
    );

    expect(result.content[0].text).toContain("new-mem-1");
    expect(result.content[0].text).toContain("Memory stored");
  });

  test("temporal store tool calls temporal endpoint", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
        temporal: { enabled: true },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "fact-1",
          content: "Alice works at Acme",
          valid_from: "2023-01-01",
          valid_to: "2024-12-31",
          confidence: 0.95,
        }),
    });

    const temporalTool = registeredTools.find((t) => t.name === "openmemory_temporal_store");
    const result = await temporalTool.execute("call-1", {
      content: "Alice works at Acme",
      valid_from: "2023-01-01",
      valid_to: "2024-12-31",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8070/api/temporal/fact",
      expect.objectContaining({
        method: "POST",
      }),
    );

    expect(result.content[0].text).toContain("fact-1");
    expect(result.content[0].text).toContain("Temporal fact stored");
  });

  test("graph traverse tool calls graph endpoint", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
        graph: { enabled: true },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          activated_nodes: [
            { id: "node-1", label: "Concept A", type: "entity", activation: 0.9 },
            { id: "node-2", label: "Concept B", type: "entity", activation: 0.7 },
          ],
          edges: [{ source: "node-1", target: "node-2", weight: 0.8, relation: "related_to" }],
          trace: ["Started at node-1", "Expanded to node-2"],
        }),
    });

    const traverseTool = registeredTools.find((t) => t.name === "openmemory_graph_traverse");
    const result = await traverseTool.execute("call-1", {
      start_node_id: "node-1",
      hops: 2,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8070/api/graph/traverse",
      expect.objectContaining({
        method: "POST",
      }),
    );

    expect(result.content[0].text).toContain("node-1");
    expect(result.content[0].text).toContain("Concept A");
  });

  test("compression stats tool calls stats endpoint", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
        compression: { autoCompress: true },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          total_memories: 150,
          compressible: 25,
          by_sector: {
            episodic: 10,
            semantic: 15,
          },
        }),
    });

    const statsTool = registeredTools.find((t) => t.name === "openmemory_compression_stats");
    const result = await statsTool.execute("call-1", {});

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:8070/api/compression/stats"),
      expect.objectContaining({
        method: "GET",
      }),
    );

    expect(result.content[0].text).toContain("150");
    expect(result.content[0].text).toContain("25");
  });

  test("handles fetch errors gracefully", async () => {
    const { default: openmemoryPlugin } = await import("./index.js");

    // oxlint-disable-next-line typescript/no-explicit-any
    const registeredTools: any[] = [];
    const mockApi = createMockApi({
      pluginConfig: {
        baseUrl: "http://localhost:8070",
        apiKey: "test-key",
        autoRecall: false,
        autoCapture: false,
      },
      // oxlint-disable-next-line typescript/no-explicit-any
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    openmemoryPlugin.register(mockApi as any);

    // Mock fetch to fail
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const searchTool = registeredTools.find((t) => t.name === "openmemory_search");
    const result = await searchTool.execute("call-1", { query: "test" });

    expect(result.content[0].text).toContain("error");
    expect(result.content[0].text).toContain("500");
  });
});

// Helper to create a mock plugin API
function createMockApi(overrides: Record<string, unknown> = {}) {
  return {
    id: "openmemory",
    name: "OpenMemory",
    source: "test",
    config: {},
    pluginConfig: {},
    runtime: {},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    registerTool: () => {},
    registerCli: () => {},
    registerService: () => {},
    on: () => {},
    resolvePath: (p: string) => p,
    ...overrides,
  };
}
