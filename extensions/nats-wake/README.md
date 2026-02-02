# OpenClaw NATS Wake

NATS Wake enables inter-agent messaging over NATS with priority-based wake behavior.

## Overview

Priority handling:

- `urgent`: queue event and wake immediately via `requestHeartbeatNow()`
- `normal`: queue event and wait for next heartbeat
- `low`: queue event without immediate wake

## Architecture

```
  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
  │   Agent A   │──────▶│ NATS Server │◀──────│   Agent B   │
  │  (gizmo)    │       │             │       │    (nyx)    │
  └─────────────┘       └─────────────┘       └─────────────┘
       │                                            │
       └── subscribes: agent.gizmo.>                │
                                                    └── subscribes: agent.nyx.>
```

## Install (dev from repo)

This plugin currently ships in the repo under `extensions/nats-wake/`.

```bash
# From the repo root
pnpm install
pnpm build

openclaw plugins install ./extensions/nats-wake
```

Restart the Gateway afterwards.

## Configuration

Add to your OpenClaw config under `plugins.entries.nats-wake.config`:

```json
{
  "plugins": {
    "entries": {
      "nats-wake": {
        "enabled": true,
        "config": {
          "enabled": true,
          "url": "nats://nats-host:4222",
          "subjects": ["agent.myagent.>", "system.>"],
          "agentName": "myagent",
          "defaultAgent": "main"
        }
      }
    }
  }
}
```

## Usage (agent tool)

```
nats(action="publish", to="gizmo", message="Hello!", priority="urgent")
```

## Message format

Inbound messages are JSON objects with fields like:

```json
{
  "to": "gizmo",
  "from": "alertmanager",
  "body": "CPU high",
  "priority": "urgent"
}
```

## Notes

- The plugin runs inside the Gateway process.
- Configure the Gateway host, then restart it to load the plugin.
