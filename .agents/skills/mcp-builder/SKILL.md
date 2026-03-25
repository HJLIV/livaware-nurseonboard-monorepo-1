---
name: mcp-builder
description: "Design and build Model Context Protocol servers and tools. Use when creating custom tool integrations, building API wrappers, or extending agent capabilities through MCP. Triggers: MCP server, build tool, custom integration, API wrapper, extend capabilities."
---

# MCP Builder

Design and implement Model Context Protocol (MCP) servers for custom tool integrations.

## When to Use

- Building a custom tool integration
- Creating an API wrapper as an MCP server
- Extending agent capabilities with new tools
- User asks to "build an MCP server" or "create a tool"

## MCP Server Structure

### Basic Server Layout
```
mcp-server-name/
  src/
    index.ts          # Server entry point
    tools/            # Tool implementations
      tool-name.ts
    resources/        # Resource providers
    prompts/          # Prompt templates
  package.json
  tsconfig.json
  README.md
```

### Tool Definition Pattern
```typescript
{
  name: "tool-name",
  description: "What this tool does and when to use it",
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "What this parameter is" }
    },
    required: ["param1"]
  }
}
```

## Design Process

### Step 1: Define Capabilities
- What tools should the server provide?
- What data/resources should it expose?
- What APIs or services does it wrap?

### Step 2: Design Tool Interfaces
For each tool:
- Name (verb-noun format: `search-issues`, `create-document`)
- Description (clear, specific, includes when to use)
- Input parameters (minimal, well-typed)
- Output format (structured, consistent)
- Error handling (meaningful error messages)

### Step 3: Implement
- Start with a single tool, test it thoroughly
- Add error handling and validation
- Implement rate limiting if calling external APIs
- Add logging for debugging
- Test with realistic inputs

### Step 4: Document
- README with setup instructions
- Tool descriptions that help the LLM use them correctly
- Example usage for each tool
- Configuration requirements

## Best Practices
- Keep tools focused — one action per tool
- Return structured data, not raw API responses
- Handle errors gracefully with helpful messages
- Validate inputs before calling external services
- Cache responses when appropriate
- Include timeout handling for external calls
