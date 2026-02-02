# Installation Verification

## Quick Test Commands

### 1. Install globally from GitHub
```bash
npm install -g github:shyn48/duo
duo-mcp --help
```

### 2. Run with npx (no install)
```bash
npx github:shyn48/duo --help
```

### 3. Install from npm (once published)
```bash
npm install -g @duo-dev/mcp-server
duo-mcp --help
```

## MCP Client Configuration

### Claude Desktop
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
See skill/SKILL.md for full setup instructions.

## Local Development Testing
```bash
git clone https://github.com/shyn48/duo.git
cd duo
npm install
npm run build
npm test  # Should show 42 tests passing
node dist/cli.js --help
```
