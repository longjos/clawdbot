/**
 * Moltbot OpenMemory Plugin
 *
 * Long-term memory with automatic recall and manual curation tools.
 * Uses OpenMemory (CaviraOSS) for multi-sector semantic memory.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

// ============================================================================
// Config Schema
// ============================================================================

const configSchema = Type.Object({
  baseUrl: Type.String({ default: "http://localhost:8070" }),
  apiKey: Type.String(),
  userId: Type.String({ default: "default" }),
  maxResults: Type.Number({ default: 5 }),
  minScore: Type.Number({ default: 0.3 }),
  autoRecall: Type.Boolean({ default: true }),
  autoCapture: Type.Boolean({ default: false }),
  // Advanced feature flags
  temporal: Type.Optional(
    Type.Object({
      enabled: Type.Boolean({ default: false }),
    }),
  ),
  graph: Type.Optional(
    Type.Object({
      enabled: Type.Boolean({ default: false }),
      traversalHops: Type.Number({ default: 1 }),
      extractEntities: Type.Boolean({ default: false }),
    }),
  ),
  sectors: Type.Optional(
    Type.Object({
      enabled: Type.Boolean({ default: false }),
      defaultSector: Type.Optional(Type.String()),
    }),
  ),
  recall: Type.Optional(
    Type.Object({
      includeTraces: Type.Boolean({ default: false }),
      temporalContext: Type.Boolean({ default: false }),
    }),
  ),
  compression: Type.Optional(
    Type.Object({
      autoCompress: Type.Boolean({ default: false }),
      threshold: Type.Number({ default: 100 }),
    }),
  ),
});

type OpenMemoryConfig = Static<typeof configSchema>;

// ============================================================================
// Types
// ============================================================================

type MemoryMatch = {
  id: string;
  content: string;
  score: number;
  primary_sector: string;
  salience: number;
};

type QueryResponse = {
  query: string;
  matches: MemoryMatch[];
};

type AddResponse = {
  id: string;
  primary_sector: string;
  sectors: string[];
  chunks: number;
};

// Temporal types
type TemporalFact = {
  id: string;
  content: string;
  entity_id?: string;
  valid_from: string; // ISO8601
  valid_to?: string;
  confidence: number;
};

type TemporalQueryResponse = {
  facts: TemporalFact[];
};

type TimelineResponse = {
  entity_id: string;
  facts: TemporalFact[];
};

// Graph types
type WaypointNode = { id: string; label: string; type: string; activation: number };
type WaypointEdge = { source: string; target: string; weight: number; relation: string };
type GraphTraversalResponse = { activated_nodes: WaypointNode[]; edges: WaypointEdge[]; trace: string[] };

type EntityExtractionResponse = {
  entities: Array<{ id: string; label: string; type: string }>;
  linked_memories: string[];
};

// Sector constant
const MEMORY_SECTORS = ["episodic", "semantic", "procedural", "emotional", "reflective"] as const;
type MemorySector = (typeof MEMORY_SECTORS)[number];

// Enhanced recall types
type RecallTrace = { node_id: string; node_label: string; contribution: number };
type EnhancedMemoryMatch = MemoryMatch & {
  composite_score: number;
  traces?: RecallTrace[];
};

type EnhancedQueryResponse = {
  query: string;
  matches: EnhancedMemoryMatch[];
};

// Compression types
type CompressionResult = { original_count: number; compressed_count: number; merged_ids: string[] };
type CompressionStats = { total_memories: number; compressible: number; by_sector: Record<string, number> };

// ============================================================================
// OpenMemory Client
// ============================================================================

class OpenMemoryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
    };
  }

  async query(query: string, userId: string, maxResults = 5): Promise<MemoryMatch[]> {
    const response = await fetch(`${this.baseUrl}/memory/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ query, user_id: userId, k: maxResults }),
    });
    if (!response.ok) {
      throw new Error(`Query failed: ${response.status}`);
    }
    const data = (await response.json()) as QueryResponse;
    return data.matches || [];
  }

  async add(content: string, userId: string, tags?: string[], metadata?: Record<string, unknown>): Promise<AddResponse> {
    const response = await fetch(`${this.baseUrl}/memory/add`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ content, user_id: userId, tags, metadata }),
    });
    if (!response.ok) {
      throw new Error(`Add failed: ${response.status}`);
    }
    return (await response.json()) as AddResponse;
  }

  async reinforce(id: string, boost = 1.5): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/memory/reinforce`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ id, boost }),
    });
    if (!response.ok) {
      throw new Error(`Reinforce failed: ${response.status}`);
    }
    return { success: true };
  }

  async update(id: string, content: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/memory/update`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ id, content }),
    });
    if (!response.ok) {
      throw new Error(`Update failed: ${response.status}`);
    }
    return { success: true };
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/memory/delete`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status}`);
    }
    return { success: true };
  }

  // ========================================================================
  // Temporal Methods
  // ========================================================================

  async storeTemporal(
    content: string,
    userId: string,
    validFrom: string,
    validTo?: string,
    entityId?: string,
    confidence = 1.0,
  ): Promise<TemporalFact> {
    const response = await fetch(`${this.baseUrl}/api/temporal/fact`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        content,
        user_id: userId,
        valid_from: validFrom,
        valid_to: validTo,
        entity_id: entityId,
        confidence,
      }),
    });
    if (!response.ok) {
      throw new Error(`Store temporal failed: ${response.status}`);
    }
    return (await response.json()) as TemporalFact;
  }

  async queryPointInTime(query: string, userId: string, asOf: string, maxResults = 5): Promise<TemporalFact[]> {
    const response = await fetch(`${this.baseUrl}/api/temporal/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ query, user_id: userId, as_of: asOf, k: maxResults }),
    });
    if (!response.ok) {
      throw new Error(`Temporal query failed: ${response.status}`);
    }
    const data = (await response.json()) as TemporalQueryResponse;
    return data.facts || [];
  }

  async getTimeline(entityId: string, userId: string): Promise<TemporalFact[]> {
    const response = await fetch(`${this.baseUrl}/api/temporal/timeline/${encodeURIComponent(entityId)}`, {
      method: "GET",
      headers: { ...this.headers(), "X-User-ID": userId },
    });
    if (!response.ok) {
      throw new Error(`Timeline failed: ${response.status}`);
    }
    const data = (await response.json()) as TimelineResponse;
    return data.facts || [];
  }

  // ========================================================================
  // Graph Methods
  // ========================================================================

  async traverseGraph(
    startNodeId: string,
    userId: string,
    hops = 1,
  ): Promise<GraphTraversalResponse> {
    const response = await fetch(`${this.baseUrl}/api/graph/traverse`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ start_node_id: startNodeId, user_id: userId, hops }),
    });
    if (!response.ok) {
      throw new Error(`Graph traversal failed: ${response.status}`);
    }
    return (await response.json()) as GraphTraversalResponse;
  }

  async extractEntities(text: string, userId: string): Promise<EntityExtractionResponse> {
    const response = await fetch(`${this.baseUrl}/api/graph/extract`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ text, user_id: userId }),
    });
    if (!response.ok) {
      throw new Error(`Entity extraction failed: ${response.status}`);
    }
    return (await response.json()) as EntityExtractionResponse;
  }

  // ========================================================================
  // Sector-Aware Methods
  // ========================================================================

  async addWithSector(
    content: string,
    userId: string,
    sector: MemorySector,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<AddResponse> {
    const response = await fetch(`${this.baseUrl}/memory/add`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ content, user_id: userId, sector, tags, metadata }),
    });
    if (!response.ok) {
      throw new Error(`Add with sector failed: ${response.status}`);
    }
    return (await response.json()) as AddResponse;
  }

  async queryWithSectors(
    query: string,
    userId: string,
    options: {
      sectors?: MemorySector[];
      maxResults?: number;
      includeTraces?: boolean;
    } = {},
  ): Promise<EnhancedMemoryMatch[]> {
    const response = await fetch(`${this.baseUrl}/memory/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query,
        user_id: userId,
        k: options.maxResults || 5,
        sectors: options.sectors,
        include_traces: options.includeTraces,
      }),
    });
    if (!response.ok) {
      throw new Error(`Enhanced query failed: ${response.status}`);
    }
    const data = (await response.json()) as EnhancedQueryResponse;
    return data.matches || [];
  }

  // ========================================================================
  // Compression Methods
  // ========================================================================

  async compress(memoryIds: string[], userId: string): Promise<CompressionResult> {
    const response = await fetch(`${this.baseUrl}/api/compression/compress`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ memory_ids: memoryIds, user_id: userId }),
    });
    if (!response.ok) {
      throw new Error(`Compression failed: ${response.status}`);
    }
    return (await response.json()) as CompressionResult;
  }

  async compressBatch(userId: string, sector?: MemorySector): Promise<CompressionResult> {
    const response = await fetch(`${this.baseUrl}/api/compression/batch`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ user_id: userId, sector }),
    });
    if (!response.ok) {
      throw new Error(`Batch compression failed: ${response.status}`);
    }
    return (await response.json()) as CompressionResult;
  }

  async getCompressionStats(userId: string): Promise<CompressionStats> {
    const response = await fetch(`${this.baseUrl}/api/compression/stats?user_id=${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Compression stats failed: ${response.status}`);
    }
    return (await response.json()) as CompressionStats;
  }
}

// ============================================================================
// Formatting
// ============================================================================

function formatMemories(matches: MemoryMatch[], minScore: number): string {
  const relevant = matches.filter((m) => m.score >= minScore || m.salience > 0.5);
  if (relevant.length === 0) {
    return "";
  }
  return relevant.map((m) => `- [${m.primary_sector || "memory"}] ${m.content}`).join("\n");
}

function formatEnhancedMemories(matches: EnhancedMemoryMatch[], minScore: number, includeTraces: boolean): string {
  const relevant = matches.filter((m) => m.score >= minScore || m.salience > 0.5);
  if (relevant.length === 0) {
    return "";
  }

  return relevant
    .map((m) => {
      let line = `- [${m.primary_sector || "memory"}] ${m.content}`;
      if (includeTraces && m.traces?.length) {
        const traceStr = m.traces
          .slice(0, 3)
          .map((t) => `${t.node_label}(${(t.contribution * 100).toFixed(0)}%)`)
          .join(", ");
        line += ` (via: ${traceStr})`;
      }
      return line;
    })
    .join("\n");
}

function formatTemporalFacts(facts: TemporalFact[]): string {
  if (facts.length === 0) {
    return "";
  }
  return facts
    .map((f) => {
      const validity = f.valid_to ? `${f.valid_from} to ${f.valid_to}` : `from ${f.valid_from}`;
      return `- [temporal] ${f.content} (${validity}, confidence: ${(f.confidence * 100).toFixed(0)}%)`;
    })
    .join("\n");
}

function formatGraphContext(traversal: GraphTraversalResponse): string {
  if (!traversal.activated_nodes.length) {
    return "";
  }
  const nodes = traversal.activated_nodes
    .slice(0, 5)
    .map((n) => `${n.label}(${n.type})`)
    .join(", ");
  return `Related concepts: ${nodes}`;
}

// ============================================================================
// Plugin Definition
// ============================================================================

const openmemoryPlugin = {
  id: "openmemory",
  name: "OpenMemory",
  description: "OpenMemory-backed long-term memory with auto-recall and curation tools",
  kind: "memory" as const,
  configSchema,

  register(api: MoltbotPluginApi) {
    api.logger.info?.(`openmemory: register() called`);

    const rawCfg = api.pluginConfig as Record<string, unknown>;
    const cfg: OpenMemoryConfig = {
      baseUrl: (rawCfg.baseUrl as string) || "http://localhost:8070",
      apiKey: rawCfg.apiKey as string,
      userId: (rawCfg.userId as string) || "default",
      maxResults: (rawCfg.maxResults as number) || 5,
      minScore: (rawCfg.minScore as number) || 0.3,
      autoRecall: rawCfg.autoRecall !== false,
      autoCapture: rawCfg.autoCapture === true,
      // Parse advanced feature flags
      temporal: rawCfg.temporal as OpenMemoryConfig["temporal"],
      graph: rawCfg.graph as OpenMemoryConfig["graph"],
      sectors: rawCfg.sectors as OpenMemoryConfig["sectors"],
      recall: rawCfg.recall as OpenMemoryConfig["recall"],
      compression: rawCfg.compression as OpenMemoryConfig["compression"],
    };

    if (!cfg.apiKey) {
      api.logger.warn?.("openmemory: No API key configured, plugin disabled");
      return;
    }

    const client = new OpenMemoryClient(cfg.baseUrl, cfg.apiKey);

    // Feature flags
    const temporalEnabled = cfg.temporal?.enabled ?? false;
    const graphEnabled = cfg.graph?.enabled ?? false;
    const sectorsEnabled = cfg.sectors?.enabled ?? false;
    const includeTraces = cfg.recall?.includeTraces ?? false;
    const temporalContext = cfg.recall?.temporalContext ?? false;
    const autoCompress = cfg.compression?.autoCompress ?? false;
    const compressionThreshold = cfg.compression?.threshold ?? 100;

    api.logger.info?.(
      `openmemory: initialized (userId=${cfg.userId}, autoRecall=${cfg.autoRecall}, ` +
        `temporal=${temporalEnabled}, graph=${graphEnabled}, sectors=${sectorsEnabled})`,
    );

    // ========================================================================
    // Tools - Memory Curation
    // ========================================================================

    api.registerTool({
      name: "openmemory_search",
      description: "Search long-term memories for relevant context",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Maximum results (default 5)" },
        },
        required: ["query"],
      },
      execute: async (_toolCallId, params) => {
        try {
          const args = params as Record<string, unknown>;
          const matches = await client.query(
            args.query as string,
            cfg.userId,
            (args.limit as number) || cfg.maxResults,
          );
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                matches: matches.map((m) => ({
                  id: m.id,
                  content: m.content,
                  sector: m.primary_sector,
                  score: m.score,
                  salience: m.salience,
                })),
              }),
            }],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
        }
      },
    });

    api.registerTool({
      name: "openmemory_add",
      description: "Store a new memory",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Memory content to store" },
          tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorization" },
        },
        required: ["content"],
      },
      execute: async (_toolCallId, params) => {
        try {
          const args = params as Record<string, unknown>;
          const result = await client.add(
            args.content as string,
            cfg.userId,
            args.tags as string[] | undefined,
          );
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ id: result.id, sector: result.primary_sector, message: "Memory stored" }),
            }],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
        }
      },
    });

    api.registerTool({
      name: "openmemory_reinforce",
      description: "Boost an important memory to increase its retrieval priority",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Memory ID to reinforce" },
          boost: { type: "number", description: "Boost factor (default 1.5, higher = more important)" },
        },
        required: ["id"],
      },
      execute: async (_toolCallId, params) => {
        try {
          const args = params as Record<string, unknown>;
          await client.reinforce(args.id as string, (args.boost as number) || 1.5);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, message: "Memory reinforced" }) }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
        }
      },
    });

    api.registerTool({
      name: "openmemory_update",
      description: "Update the content of an existing memory",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Memory ID to update" },
          content: { type: "string", description: "New content for the memory" },
        },
        required: ["id", "content"],
      },
      execute: async (_toolCallId, params) => {
        try {
          const args = params as Record<string, unknown>;
          await client.update(args.id as string, args.content as string);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, message: "Memory updated" }) }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
        }
      },
    });

    api.registerTool({
      name: "openmemory_delete",
      description: "Delete a memory (use sparingly)",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Memory ID to delete" },
        },
        required: ["id"],
      },
      execute: async (_toolCallId, params) => {
        try {
          const args = params as Record<string, unknown>;
          await client.remove(args.id as string);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, message: "Memory deleted" }) }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
        }
      },
    });

    // ========================================================================
    // Tools - Temporal Facts (when enabled)
    // ========================================================================

    if (temporalEnabled) {
      api.registerTool({
        name: "openmemory_temporal_store",
        description: "Store a time-bounded fact with validity period",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Fact content to store" },
            valid_from: { type: "string", description: "Start of validity period (ISO8601 date)" },
            valid_to: { type: "string", description: "End of validity period (ISO8601 date, optional)" },
            entity_id: { type: "string", description: "Entity this fact relates to (optional)" },
            confidence: { type: "number", description: "Confidence score 0-1 (default 1.0)" },
          },
          required: ["content", "valid_from"],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const fact = await client.storeTemporal(
              args.content as string,
              cfg.userId,
              args.valid_from as string,
              args.valid_to as string | undefined,
              args.entity_id as string | undefined,
              (args.confidence as number) ?? 1.0,
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ id: fact.id, message: "Temporal fact stored" }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });

      api.registerTool({
        name: "openmemory_temporal_query",
        description: "Query facts that were true at a specific point in time",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            as_of: { type: "string", description: "Point in time to query (ISO8601 date)" },
            limit: { type: "number", description: "Maximum results (default 5)" },
          },
          required: ["query", "as_of"],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const facts = await client.queryPointInTime(
              args.query as string,
              cfg.userId,
              args.as_of as string,
              (args.limit as number) || cfg.maxResults,
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ facts }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });

      api.registerTool({
        name: "openmemory_timeline",
        description: "Get the history of facts about an entity over time",
        parameters: {
          type: "object",
          properties: {
            entity_id: { type: "string", description: "Entity ID to get timeline for" },
          },
          required: ["entity_id"],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const facts = await client.getTimeline(args.entity_id as string, cfg.userId);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ entity_id: args.entity_id, facts }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });
    }

    // ========================================================================
    // Tools - Graph Traversal (when enabled)
    // ========================================================================

    if (graphEnabled) {
      api.registerTool({
        name: "openmemory_graph_traverse",
        description: "Traverse the memory graph from a starting node to find related concepts",
        parameters: {
          type: "object",
          properties: {
            start_node_id: { type: "string", description: "Node ID to start traversal from" },
            hops: { type: "number", description: "Number of hops to traverse (default 1)" },
          },
          required: ["start_node_id"],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const result = await client.traverseGraph(
              args.start_node_id as string,
              cfg.userId,
              (args.hops as number) || cfg.graph?.traversalHops || 1,
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    activated_nodes: result.activated_nodes,
                    edges: result.edges,
                    trace: result.trace,
                  }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });

      api.registerTool({
        name: "openmemory_extract_entities",
        description: "Extract and link entities from text to the memory graph",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to extract entities from" },
          },
          required: ["text"],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const result = await client.extractEntities(args.text as string, cfg.userId);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    entities: result.entities,
                    linked_memories: result.linked_memories,
                  }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });
    }

    // ========================================================================
    // Tools - Sector-Aware Storage (when enabled)
    // ========================================================================

    if (sectorsEnabled) {
      api.registerTool({
        name: "openmemory_add_sector",
        description: "Store a memory in a specific cognitive sector",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Memory content to store" },
            sector: {
              type: "string",
              enum: [...MEMORY_SECTORS],
              description: "Cognitive sector: episodic (events), semantic (facts), procedural (how-to), emotional (feelings), reflective (insights)",
            },
            tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
          },
          required: ["content", "sector"],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const sector = args.sector as MemorySector;
            if (!MEMORY_SECTORS.includes(sector)) {
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify({ error: `Invalid sector: ${sector}` }) },
                ],
              };
            }
            const result = await client.addWithSector(
              args.content as string,
              cfg.userId,
              sector,
              args.tags as string[] | undefined,
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ id: result.id, sector: result.primary_sector, message: "Memory stored in sector" }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });

      api.registerTool({
        name: "openmemory_search_sectors",
        description: "Search memories filtered by cognitive sectors with optional trace explanation",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            sectors: {
              type: "array",
              items: { type: "string", enum: [...MEMORY_SECTORS] },
              description: "Sectors to search in (all if not specified)",
            },
            include_traces: { type: "boolean", description: "Include explanation of why memories matched" },
            limit: { type: "number", description: "Maximum results (default 5)" },
          },
          required: ["query"],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const matches = await client.queryWithSectors(args.query as string, cfg.userId, {
              sectors: args.sectors as MemorySector[] | undefined,
              maxResults: (args.limit as number) || cfg.maxResults,
              includeTraces: (args.include_traces as boolean) ?? includeTraces,
            });
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    matches: matches.map((m) => ({
                      id: m.id,
                      content: m.content,
                      sector: m.primary_sector,
                      score: m.score,
                      composite_score: m.composite_score,
                      traces: m.traces,
                    })),
                  }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });
    }

    // ========================================================================
    // Tools - Compression (when enabled)
    // ========================================================================

    if (autoCompress || cfg.compression) {
      api.registerTool({
        name: "openmemory_compress",
        description: "Compress redundant or similar memories to reduce clutter",
        parameters: {
          type: "object",
          properties: {
            memory_ids: {
              type: "array",
              items: { type: "string" },
              description: "Specific memory IDs to compress together (optional - compresses all if not specified)",
            },
            sector: {
              type: "string",
              enum: [...MEMORY_SECTORS],
              description: "Only compress memories in this sector (optional)",
            },
          },
          required: [],
        },
        execute: async (_toolCallId, params) => {
          try {
            const args = params as Record<string, unknown>;
            const memoryIds = args.memory_ids as string[] | undefined;
            const sector = args.sector as MemorySector | undefined;

            let result: CompressionResult;
            if (memoryIds?.length) {
              result = await client.compress(memoryIds, cfg.userId);
            } else {
              result = await client.compressBatch(cfg.userId, sector);
            }

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    original_count: result.original_count,
                    compressed_count: result.compressed_count,
                    merged_ids: result.merged_ids,
                    message: `Compressed ${result.original_count} memories into ${result.compressed_count}`,
                  }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });

      api.registerTool({
        name: "openmemory_compression_stats",
        description: "Get statistics about memory compression potential",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
        execute: async () => {
          try {
            const stats = await client.getCompressionStats(cfg.userId);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    total_memories: stats.total_memories,
                    compressible: stats.compressible,
                    by_sector: stats.by_sector,
                    message: `${stats.compressible} of ${stats.total_memories} memories can be compressed`,
                  }),
                },
              ],
            };
          } catch (err) {
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
          }
        },
      });
    }

    // ========================================================================
    // Lifecycle Hooks
    // ========================================================================

    if (cfg.autoRecall) {
      api.logger.info?.("openmemory: registering before_agent_start hook");
      api.on("before_agent_start", async (event, _ctx) => {
        if (!event.prompt || event.prompt.length < 10) {
          return;
        }

        try {
          const sections: string[] = [];

          // Query memories with enhanced scoring and optional traces
          const matches = await client.queryWithSectors(event.prompt, cfg.userId, {
            maxResults: cfg.maxResults,
            includeTraces,
          });
          const memoryContext = includeTraces
            ? formatEnhancedMemories(matches, cfg.minScore, true)
            : formatMemories(matches, cfg.minScore);
          if (memoryContext) {
            sections.push(`## Memories\n${memoryContext}`);
          }

          // If temporal context is enabled, extract entities and fetch current facts
          if (temporalContext && temporalEnabled) {
            try {
              const entityResult = await client.extractEntities(event.prompt, cfg.userId);
              if (entityResult.entities.length > 0) {
                const now = new Date().toISOString();
                const allFacts: TemporalFact[] = [];

                for (const entity of entityResult.entities.slice(0, 3)) {
                  const facts = await client.queryPointInTime(entity.label, cfg.userId, now, 3);
                  allFacts.push(...facts);
                }

                const temporalSection = formatTemporalFacts(allFacts);
                if (temporalSection) {
                  sections.push(`## Current Facts\n${temporalSection}`);
                }
              }
            } catch (err) {
              api.logger.warn?.(`openmemory: temporal context failed: ${String(err)}`);
            }
          }

          // If graph traversal is enabled, explore related concepts
          if (graphEnabled && matches.length > 0) {
            try {
              // Use the top match to traverse related concepts
              const topMatchId = matches[0]?.id;
              if (topMatchId) {
                const traversal = await client.traverseGraph(
                  topMatchId,
                  cfg.userId,
                  cfg.graph?.traversalHops || 1,
                );
                const graphSection = formatGraphContext(traversal);
                if (graphSection) {
                  sections.push(`## ${graphSection}`);
                }
              }
            } catch (err) {
              api.logger.warn?.(`openmemory: graph traversal failed: ${String(err)}`);
            }
          }

          if (sections.length === 0) {
            return;
          }

          api.logger.info?.(
            `openmemory: injecting ${matches.length} memories` +
              (sections.length > 1 ? ` + ${sections.length - 1} additional sections` : ""),
          );
          return {
            prependContext: `<recalled-memories>\n${sections.join("\n\n")}\n</recalled-memories>`,
          };
        } catch (err) {
          api.logger.warn?.(`openmemory: recall failed: ${String(err)}`);
        }
      });
    }

    if (cfg.autoCapture) {
      api.on("agent_end", async (event) => {
        if (!event.success || !event.messages?.length) {
          return;
        }

        for (const msg of event.messages) {
          if (!msg || typeof msg !== "object") {
            continue;
          }
          const msgObj = msg as Record<string, unknown>;
          if (msgObj.role !== "user") {
            continue;
          }
          const content = msgObj.content;
          if (typeof content !== "string" || content.length < 20) {
            continue;
          }

          const lower = content.toLowerCase();
          if (lower.includes("remember") || lower.includes("don't forget") || lower.includes("note that")) {
            try {
              // Determine sector based on content patterns
              let sector: MemorySector | undefined;
              if (sectorsEnabled) {
                if (lower.includes("how to") || lower.includes("steps to") || lower.includes("procedure")) {
                  sector = "procedural";
                } else if (lower.includes("feel") || lower.includes("emotion") || lower.includes("love") || lower.includes("hate")) {
                  sector = "emotional";
                } else if (lower.includes("learned") || lower.includes("realized") || lower.includes("insight")) {
                  sector = "reflective";
                } else if (lower.includes("happened") || lower.includes("yesterday") || lower.includes("today") || lower.includes("last")) {
                  sector = "episodic";
                } else {
                  sector = (cfg.sectors?.defaultSector as MemorySector) || "semantic";
                }
              }

              // Store with sector if enabled, otherwise use basic add
              if (sector && sectorsEnabled) {
                await client.addWithSector(content, cfg.userId, sector, ["auto-captured"]);
                api.logger.info?.(`openmemory: auto-captured memory in ${sector} sector`);
              } else {
                await client.add(content, cfg.userId, ["auto-captured"]);
                api.logger.info?.("openmemory: auto-captured memory");
              }

              // Extract entities if enabled
              if (cfg.graph?.extractEntities) {
                try {
                  await client.extractEntities(content, cfg.userId);
                  api.logger.info?.("openmemory: entities extracted from captured memory");
                } catch (err) {
                  api.logger.warn?.(`openmemory: entity extraction failed: ${String(err)}`);
                }
              }

              // Trigger auto-compression if threshold exceeded
              if (autoCompress) {
                try {
                  const stats = await client.getCompressionStats(cfg.userId);
                  if (stats.compressible >= compressionThreshold) {
                    api.logger.info?.(`openmemory: triggering auto-compression (${stats.compressible} compressible)`);
                    await client.compressBatch(cfg.userId);
                  }
                } catch (err) {
                  api.logger.warn?.(`openmemory: auto-compression check failed: ${String(err)}`);
                }
              }
            } catch (err) {
              api.logger.warn?.(`openmemory: auto-capture failed: ${String(err)}`);
            }
          }
        }
      });
    }
  },
};

export default openmemoryPlugin;
