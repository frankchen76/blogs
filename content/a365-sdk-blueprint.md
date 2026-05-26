---
title: A365 SDK Blueprint
category: Agent365
author: Copilot Sample
date: 2026-05-25
tags: sdk, architecture, agent365, blueprint
summary: A practical starter blueprint for structuring an Agent365 SDK project.
status: draft
imgUrl: assets/a365-sdk-blueprint-thumb.png
---

## Goals

- Define a predictable project layout.
- Separate orchestration, tools, and domain logic.
- Keep prompts and configuration version-controlled.

## Suggested Folder Structure

```text
src/
  agents/
    assistant-agent.ts
  tools/
    graph-tool.ts
    search-tool.ts
  workflows/
    intake-workflow.ts
  prompts/
    system.md
  config/
    runtime.ts
  index.ts
```

## Core Design Principles

1. Keep the agent instruction small and focused.
2. Move reusable behaviors into tools.
3. Use workflows for multi-step business processes.
4. Add tracing and evaluation early.

## Minimal Runtime Checklist

- Environment variables for model endpoint and API key.
- Central config loader with validation.
- Logging and request correlation IDs.
- Retry policy for external tool calls.

## Example Tool Contract

```ts
export interface ToolResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
```

## Next Steps

- Add unit tests around tool adapters.
- Add prompt regression tests for critical scenarios.
- Add CI checks for lint, type-check, and test coverage.
