---
summary: "NATS Wake plugin: wake agents immediately via NATS messages with priority support, plus send/receive for agent-to-agent communication"
read_when:
  - You want to wake agents via NATS message bus
  - You are integrating OpenClaw with a NATS-based system
  - You need sub-second latency for urgent alerts
  - You want agents to send messages to other agents
title: "NATS Wake Plugin"
---

# NATS Wake (plugin)

Wake agents immediately via NATS messages instead of waiting for heartbeat intervals. Also provides a `nats` tool for agents to publish messages back.

Use cases:

- Critical alerts that need immediate attention
- Agent-to-agent communication
- Integration with monitoring systems (Prometheus Alertmanager, etc.)
- Event-driven workflows

## Problem solved

By default, agents check their inbox on heartbeat intervals (up to 2 minutes). This plugin subscribes to NATS subjects and wakes agents immediately when urgent messages arrive.

## Message flow

```
NATS Server
    │
    │ publish to agent.gizmo.inbox
    │ {"to":"gizmo","from":"alertmanager","body":"CPU high","priority":"urgent"}
    ▼
NATS Wake Plugin (in Gateway)
    │
    │ parse → route → inject event → wake
    ▼
Agent wakes within ~250ms
```

## Install

### Option A: install from npm

```bash
openclaw plugins install @openclaw/nats-wake
```

Restart the Gateway afterwards.

### Option B: install from local folder (dev)

```bash
openclaw plugins install ./extensions/nats-wake
cd ./extensions/nats-wake && pnpm install
```

Restart the Gateway afterwards.

## Config

Set config under `plugins.entries.nats-wake.config`:

```json5
{
  plugins: {
    entries: {
      "nats-wake": {
        enabled: true,
        config: {
          enabled: true,
          url: "nats://localhost:4222",
          subjects: ["agent.*.inbox"],

          // Optional: authentication
          credentials: {
            token: "secret-token",
            // or user/pass:
            // user: "openclaw",
            // pass: "secret",
          },

          // Optional: reconnection settings
          reconnect: {
            maxAttempts: -1,    // -1 = infinite
            delayMs: 1000,      // initial delay
            maxDelayMs: 30000,  // max backoff
          },

          // Optional: default agent for messages without "to" field
          defaultAgent: "main",

          // Optional: this agent's name (used as "from" in outgoing messages)
          agentName: "nyx",
        },
      },
    },
  },
}
```

### Config fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the plugin |
| `url` | string | required | NATS server URL (`nats://`, `tls://`, `ws://`, `wss://`) |
| `subjects` | string[] | required | NATS subjects to subscribe (wildcards supported) |
| `credentials.token` | string | - | NATS auth token |
| `credentials.user` | string | - | NATS username |
| `credentials.pass` | string | - | NATS password |
| `reconnect.maxAttempts` | number | `-1` | Max reconnect attempts (-1 = infinite) |
| `reconnect.delayMs` | number | `1000` | Initial reconnect delay (ms) |
| `reconnect.maxDelayMs` | number | `30000` | Maximum reconnect delay (ms) |
| `defaultAgent` | string | `"main"` | Default agent when `to` field is missing |
| `agentName` | string | - | This agent's name (used as `from` in outgoing messages) |

## Message format

Publish JSON messages to your configured subjects:

```json
{
  "to": "gizmo",
  "from": "alertmanager",
  "body": "Service X is down",
  "priority": "urgent"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | no | Target agent name. Routes to `agent:{to}:main` session. Defaults to `defaultAgent` config. |
| `from` | string | **yes** | Sender identifier (shown in event text) |
| `body` | string | **yes** | Message content |
| `priority` | string | no | `urgent`, `normal`, or `low`. Default: `normal` |
| `metadata` | object | no | Additional metadata (not currently used) |

### Priority levels

| Priority | Behavior | Use case |
|----------|----------|----------|
| `urgent` | Inject event + wake immediately | Critical alerts, agent-to-agent requests |
| `normal` | Inject event only (waits for heartbeat) | Regular notifications |
| `low` | Inject event only (no immediate wake) | Informational, debug logs |

### Event format

Messages are injected as system events with this format:

```
[URGENT from alertmanager] Service X is down
[NORMAL from cron] Daily report ready
```

## Agent tool: `nats`

The plugin registers a `nats` tool that agents can use to publish messages to other agents or systems.

### Tool parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | **yes** | `publish` (fire-and-forget) or `request` (wait for reply) |
| `subject` | string | no | Full NATS subject (e.g. `agent.gizmo.inbox`) |
| `to` | string | no | Shorthand: `gizmo` becomes `agent.gizmo.inbox` |
| `message` | string | **yes** | Message body to send |
| `priority` | string | no | `urgent`, `normal`, or `low` (default: `normal`) |
| `timeoutMs` | number | no | Timeout for `request` action (default: 5000) |

Either `subject` or `to` must be provided.
If `to` is omitted and `subject` is not `agent.<name>.inbox`, the `to` field in the outgoing payload defaults to `defaultAgent` (or `unknown`).

### Usage examples

```
// Send to another agent
nats(action="publish", to="gizmo", message="Hey, checking in!")

// Broadcast to all agents
nats(action="publish", subject="system.broadcast", message="Maintenance in 10 min")

// Urgent alert
nats(action="publish", to="nyx", message="Service X is down!", priority="urgent")

// Request/reply (waits for response)
nats(action="request", to="gizmo", message="What's your status?", timeoutMs=10000)
```

### Outgoing message format

Messages sent by the `nats` tool use the same JSON format:

```json
{
  "from": "nyx",
  "to": "gizmo",
  "body": "Hey, checking in!",
  "priority": "normal",
  "metadata": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "source": "nats-tool"
  }
}
```

The `from` field is automatically set from the `agentName` config (falls back to `defaultAgent` or `"unknown"`). The `to` field follows the `to` parameter when provided, otherwise it derives from `agent.<name>.inbox` subjects or falls back to `defaultAgent`/`"unknown"`.

## NATS subject patterns

The plugin supports NATS wildcards:

| Pattern | Matches |
|---------|---------|
| `agent.*.inbox` | `agent.gizmo.inbox`, `agent.alice.inbox` |
| `agent.>` | `agent.gizmo.inbox`, `agent.gizmo.alerts`, etc. |
| `alerts.critical` | Exact match only |

Example multi-subject config:

```json5
{
  subjects: [
    "agent.*.inbox",      // Per-agent inboxes
    "system.broadcast",   // System-wide broadcasts
    "alerts.>",           // All alert topics
  ],
}
```

## Multi-agent routing

Messages are routed to agents based on the `to` field:

```json
{"to": "alice", "from": "bob", "body": "Hello", "priority": "urgent"}
```

Routes to session key: `agent:alice:main`

If `to` is missing, routes to `defaultAgent` (default: `"main"`).

## Examples

### NATS CLI

```bash
# Install NATS CLI
brew install nats-io/nats-tools/nats

# Urgent message to agent "gizmo"
nats pub agent.gizmo.inbox '{"to":"gizmo","from":"cli","body":"Test alert","priority":"urgent"}'

# Normal message (waits for heartbeat)
nats pub agent.main.inbox '{"to":"main","from":"cron","body":"Daily summary ready","priority":"normal"}'

# Broadcast to all agents (if subscribed to system.>)
nats pub system.broadcast '{"from":"admin","body":"Maintenance in 5 minutes","priority":"urgent"}'
```

### Node.js

```javascript
import { connect } from "nats";

const nc = await connect({ servers: "nats://localhost:4222" });

// Send urgent alert
nc.publish("agent.gizmo.inbox", JSON.stringify({
  to: "gizmo",
  from: "monitoring",
  body: "CPU usage at 95%",
  priority: "urgent",
}));

await nc.drain();
```

### Python

```python
import asyncio
import json
from nats.aio.client import Client as NATS

async def main():
    nc = NATS()
    await nc.connect("nats://localhost:4222")

    await nc.publish(
        "agent.gizmo.inbox",
        json.dumps({
            "to": "gizmo",
            "from": "python-script",
            "body": "Task completed",
            "priority": "urgent",
        }).encode()
    )

    await nc.drain()

asyncio.run(main())
```

### Prometheus Alertmanager

Configure Alertmanager to send to a webhook that publishes to NATS:

```yaml
# alertmanager.yml
receivers:
  - name: openclaw
    webhook_configs:
      - url: http://nats-bridge:8080/alert
        send_resolved: true
```

Then use a simple bridge service that converts webhooks to NATS messages.

## Connection resilience

The plugin automatically reconnects on connection failure:

- Uses exponential backoff (configurable)
- Logs connection state changes
- Does not crash the gateway on NATS unavailability

Example logs:

```
nats-wake: connected to nats://localhost:4222
nats-wake: connection closed: connection refused
nats-wake: reconnecting in 1000ms (attempt 1)
nats-wake: reconnecting in 2000ms (attempt 2)
nats-wake: connected to nats://localhost:4222
```

## NATS server setup

### Docker (quick start)

```bash
# Start NATS server
docker run -d --name nats -p 4222:4222 nats:latest

# Verify
nats server check connection
```

### With JetStream (durable)

```bash
docker run -d --name nats-js -p 4222:4222 nats:latest -js
```

### With authentication

```bash
docker run -d --name nats-auth -p 4222:4222 \
  -e NATS_TOKEN=secret-token \
  nats:latest --auth secret-token
```

## Comparison with webhooks

| Feature | NATS Wake | HTTP Webhooks |
|---------|-----------|---------------|
| Latency | ~250ms (push) | ~250ms (push) |
| Protocol | NATS (TCP) | HTTP |
| Multi-agent | Native (wildcards) | Requires routing logic |
| Persistence | Optional (JetStream) | No (fire-and-forget) |
| Auth | Token/user-pass | Bearer token |
| Best for | Internal systems, high throughput | External integrations |

Use NATS Wake when:
- You already have NATS infrastructure
- You need fan-out to multiple agents
- You want persistent message delivery (with JetStream)

Use HTTP webhooks when:
- Integrating with external services
- You need simple REST-based triggers
- No NATS infrastructure available

## Troubleshooting

### Plugin not loading

Check that the plugin is enabled:

```bash
openclaw plugins list
```

Verify config:

```bash
openclaw config get plugins.entries.nats-wake
```

### Connection failures

Check NATS server is reachable:

```bash
nats server check connection --server nats://localhost:4222
```

Check credentials if using auth:

```bash
nats server check connection --server nats://localhost:4222 --creds /path/to/creds
```

### Messages not waking agent

1. Verify subject pattern matches:
   ```bash
   nats sub "agent.>" --server nats://localhost:4222
   # Then publish and see if message appears
   ```

2. Check message format (must be valid JSON with `from` and `body`):
   ```bash
   nats pub agent.main.inbox '{"from":"test","body":"hello","priority":"urgent"}'
   ```

3. Check priority is `urgent` (not `normal` or `low`)

4. Check gateway logs for errors:
   ```bash
   openclaw logs -f | grep nats-wake
   ```

### Agent not receiving events

System events are drained on the next agent turn. Check:

1. Agent has a heartbeat configured
2. No errors in agent execution
3. Session is not locked by another request
