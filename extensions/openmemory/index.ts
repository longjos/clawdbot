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
    if (!response.ok) throw new Error(`Query failed: ${response.status}`);
    const data = (await response.json()) as QueryResponse;
    return data.matches || [];
  }

  async add(content: string, userId: string, tags?: string[], metadata?: Record<string, unknown>): Promise<AddResponse> {
    const response = await fetch(`${this.baseUrl}/memory/add`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ content, user_id: userId, tags, metadata }),
    });
    if (!response.ok) throw new Error(`Add failed: ${response.status}`);
    return (await response.json()) as AddResponse;
  }

  async reinforce(id: string, boost = 1.5): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/memory/reinforce`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ id, boost }),
    });
    if (!response.ok) throw new Error(`Reinforce failed: ${response.status}`);
    return { success: true };
  }

  async update(id: string, content: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/memory/update`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ id, content }),
    });
    if (!response.ok) throw new Error(`Update failed: ${response.status}`);
    return { success: true };
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/memory/delete`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
    return { success: true };
  }
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Simple word-based Jaccard similarity for deduplication.
 * Returns 0-1 where 1 = identical word sets.
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicate memories by content similarity.
 * Keeps higher-scoring memory when two are too similar.
 */
function dedupeMemories(matches: MemoryMatch[], similarityThreshold = 0.6): MemoryMatch[] {
  if (matches.length <= 1) return matches;
  
  const kept: MemoryMatch[] = [];
  for (const candidate of matches) {
    let isDupe = false;
    for (const existing of kept) {
      if (jaccardSimilarity(candidate.content, existing.content) >= similarityThreshold) {
        isDupe = true;
        break;
      }
    }
    if (!isDupe) {
      kept.push(candidate);
    }
  }
  return kept;
}

function formatMemories(matches: MemoryMatch[], minScore: number): string {
  // Require score >= minScore (salience no longer bypasses relevance check)
  // High salience without relevance was causing feedback loops
  const relevant = matches.filter((m) => m.score >= minScore);
  if (relevant.length === 0) return "";
  
  // Dedupe similar memories before formatting
  const deduped = dedupeMemories(relevant);
  return deduped.map((m) => `- [${m.primary_sector || "memory"}] ${m.content}`).join("\n");
}

/**
 * Build a search query from conversation history + current prompt.
 * Uses last N turns to capture conversation context, not just the latest message.
 */
function buildSearchQuery(messages: unknown[] | undefined, currentPrompt: string, maxTurns = 4): string {
  if (!messages || messages.length === 0) {
    return currentPrompt;
  }

  // Extract text content from recent messages
  const recentTexts: string[] = [];
  const relevantMessages = messages.slice(-maxTurns * 2); // Last N turns (user + assistant pairs)

  for (const msg of relevantMessages) {
    if (!msg || typeof msg !== "object") continue;
    const msgObj = msg as Record<string, unknown>;
    const role = msgObj.role as string;
    const content = msgObj.content;

    // Skip system messages, only use user and assistant
    if (role !== "user" && role !== "assistant") continue;

    if (typeof content === "string" && content.length > 0) {
      // Truncate very long messages to avoid overwhelming the query
      const text = content.length > 500 ? content.slice(0, 500) + "..." : content;
      recentTexts.push(`[${role}]: ${text}`);
    }
  }

  // Add current prompt at the end (it might not be in messages yet)
  if (currentPrompt && !recentTexts.some(t => t.includes(currentPrompt))) {
    recentTexts.push(`[user]: ${currentPrompt}`);
  }

  // Join with newlines — semantic search will find relevant memories based on the whole context
  return recentTexts.join("\n");
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
    };

    if (!cfg.apiKey) {
      api.logger.warn?.("openmemory: No API key configured, plugin disabled");
      return;
    }

    const client = new OpenMemoryClient(cfg.baseUrl, cfg.apiKey);

    api.logger.info?.(
      `openmemory: initialized (userId=${cfg.userId}, autoRecall=${cfg.autoRecall})`,
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
    // Lifecycle Hooks
    // ========================================================================

    if (cfg.autoRecall) {
      api.logger.info?.(`openmemory: registering before_agent_start hook (minScore=${cfg.minScore})`);
      api.on("before_agent_start", async (event, ctx) => {
        if (!event.prompt || event.prompt.length < 10) return;

        try {
          // Build query from conversation context, not just current prompt
          const searchQuery = buildSearchQuery(event.messages, event.prompt);
          api.logger.debug?.(`openmemory: searching with ${searchQuery.length} chars of context (minScore=${cfg.minScore})`);
          
          const matches = await client.query(searchQuery, cfg.userId, cfg.maxResults);
          api.logger.debug?.(`openmemory: got ${matches.length} matches, scores: ${matches.map(m => m.score.toFixed(2)).join(', ')}`);
          
          const memoryContext = formatMemories(matches, cfg.minScore);
          if (!memoryContext) {
            api.logger.debug?.("openmemory: no memories passed filter");
            return;
          }

          const injectedCount = memoryContext.split('\n').length;
          api.logger.info?.(`openmemory: injecting ${injectedCount} memories (from ${matches.length} candidates)`);
          return {
            prependContext: `<recalled-memories>\nThe following memories may be relevant:\n${memoryContext}\n</recalled-memories>`,
          };
        } catch (err) {
          api.logger.warn?.(`openmemory: recall failed: ${String(err)}`);
        }
      });
    }

    if (cfg.autoCapture) {
      api.on("agent_end", async (event) => {
        if (!event.success || !event.messages?.length) return;

        for (const msg of event.messages) {
          if (!msg || typeof msg !== "object") continue;
          const msgObj = msg as Record<string, unknown>;
          if (msgObj.role !== "user") continue;
          const content = msgObj.content;
          if (typeof content !== "string" || content.length < 20) continue;

          const lower = content.toLowerCase();
          if (lower.includes("remember") || lower.includes("don't forget") || lower.includes("note that")) {
            try {
              await client.add(content, cfg.userId, ["auto-captured"]);
              api.logger.info?.("openmemory: auto-captured memory");
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
