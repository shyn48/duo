# Duo MCP Server

**Collaborative pair programming for AI-assisted development.**

Duo splits coding tasks between human and AI so you write the interesting parts, AI handles the boilerplate, and both cross-review for better code quality.

## Goals

- **Code Quality** — Cross-review catches more bugs than single-reviewer workflows
- **Codebase Understanding** — Stay in the loop, understand all code (not just what you wrote)
- **Enjoyability** — Code the interesting parts while AI handles the tedious parts
- **Speed** — Parallel execution keeps delivery fast

## Installation

### Via npm (recommended)

```bash
npm install -g @duo-dev/mcp-server
```

### Via npx (no install)

```bash
npx @duo-dev/mcp-server
```

### From GitHub

```bash
npm install -g github:shyn48/duo
```

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "duo": {
      "command": "duo-mcp"
    }
  }
}
```

### Cursor

Add to your project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "duo": {
      "command": "duo-mcp"
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP configuration file:

```json
{
  "mcpServers": {
    "duo": {
      "command": "duo-mcp"
    }
  }
}
```

### OpenClaw

See [skill/SKILL.md](skill/SKILL.md) for OpenClaw-specific setup instructions.

### Direct usage

```bash
# Start MCP server
duo-mcp

# Show available tools
duo-mcp inspect

# Show help
duo-mcp --help
```

## Workflow

```
1. Design    → Collaborative design discussion
2. Plan      → AI generates task breakdown, human approves
3. Execute   → Parallel coding (human + AI sub-agents)
4. Review    → Cross-review each other's code
5. Integrate → Merge, test, commit
```

## Tools (14)

| Category | Tool | Description |
|----------|------|-------------|
| Session | `duo_session_start` | Start a new collaborative session |
| Session | `duo_session_status` | Show phase + task board |
| Session | `duo_phase_advance` | Move to next phase |
| Session | `duo_design_save` | Save agreed design |
| Session | `duo_session_end` | End session |
| Tasks | `duo_task_add` | Add a task |
| Tasks | `duo_task_add_bulk` | Add multiple tasks |
| Tasks | `duo_task_update` | Update task status |
| Tasks | `duo_task_reassign` | Swap assignee |
| Tasks | `duo_task_board` | Show task board |
| Tasks | `duo_help_request` | Get help (hints → code) |
| Review | `duo_review_start` | Begin cross-review |
| Review | `duo_review_submit` | Submit feedback |
| Review | `duo_integrate` | Integration checks |

## Resources (3)

| URI | Description |
|-----|-------------|
| `duo://task-board` | Current task board |
| `duo://design` | Agreed design document |
| `duo://progress` | Session progress summary |

## How It Works

1. Say "duo" to start a session
2. Discuss the design — AI challenges, you refine
3. AI breaks down tasks: interesting ones for you, boilerplate for AI
4. You code in your IDE, AI works in parallel via sub-agents
5. Both review each other's code
6. Merge, test, commit — done

The key insight: you write ~30% of the code (the important 30%), understand 100% of it, and ship faster than doing everything yourself.

## Documentation

- **[SPEC.md](SPEC.md)** — Full specification and design principles
- **[skill/SKILL.md](skill/SKILL.md)** — OpenClaw skill integration
- **[skill/references/](skill/references/)** — Phase-specific guidance documents

## Development

```bash
# Clone the repo
git clone https://github.com/shyn48/duo.git
cd duo

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## License

MIT
