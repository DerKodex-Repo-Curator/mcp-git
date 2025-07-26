# MCP Git Server

A Model Context Protocol (MCP) server that provides Git version control operations for Claude.

## Features

- 📊 **Repository Status**: Check git status and working tree state
- 🔍 **View Changes**: Show diffs for staged and unstaged changes
- ➕ **Stage Files**: Add files to the staging area
- 💾 **Commit Changes**: Create commits with messages
- 🌿 **Branch Operations**: List, create, switch, and delete branches
- 📜 **View History**: Show commit logs
- ⬆️ **Push Changes**: Push commits to remote repositories
- ⬇️ **Pull Changes**: Pull updates from remote repositories
- 📦 **Clone Repositories**: Clone remote repositories
- 🚀 **Initialize Repos**: Create new git repositories

## Installation

1. **Prerequisites**:
   - Node.js 18+ installed
   - Git installed and configured

2. **Install the MCP server**:
   ```bash
   cd /Users/bard/Code/mcp-git
   npm install
   ```

3. **Add to Claude Desktop config**:
   Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "git": {
         "command": "node",
         "args": ["/Users/bard/Code/mcp-git/src/index.js"]
       }
     }
   }
   ```

4. **Restart Claude Desktop**

## Usage

### Check Repository Status
```javascript
git_status({ path: "/path/to/repo" })
git_status({ short: true })  // Short format
```

### View Changes
```javascript
git_diff()  // Unstaged changes
git_diff({ staged: true })  // Staged changes
git_diff({ file: "README.md" })  // Specific file
```

### Stage Files
```javascript
git_add({ files: ["README.md", "src/index.js"] })
git_add({ files: ["."] })  // Stage all changes
```

### Commit Changes
```javascript
git_commit({ message: "Add new feature" })
```

### Branch Operations
```javascript
git_branch()  // List branches
git_branch({ action: "create", name: "feature/new-feature" })
git_branch({ action: "switch", name: "main" })
git_branch({ action: "delete", name: "old-branch" })
```

### View Commit History
```javascript
git_log()  // Last 10 commits, one-line format
git_log({ limit: 20, oneline: false })  // Detailed format
```

### Push and Pull
```javascript
git_push()  // Push current branch to origin
git_push({ branch: "main", force: true })  // Force push specific branch

git_pull()  // Pull current branch from origin
git_pull({ remote: "upstream", branch: "main" })
```

### Clone Repository
```javascript
git_clone({ url: "https://github.com/user/repo.git" })
git_clone({ url: "git@github.com:user/repo.git", path: "my-repo" })
```

### Initialize Repository
```javascript
git_init({ path: "/path/to/new/repo" })
git_init({ bare: true })  // Create bare repository
```

## Tool Reference

| Tool | Description | Required Args |
|------|-------------|---------------|
| `git_status` | Show repository status | None |
| `git_diff` | Show changes | None |
| `git_add` | Stage files | `files` |
| `git_commit` | Create commit | `message` |
| `git_branch` | Manage branches | None |
| `git_log` | Show commit history | None |
| `git_push` | Push to remote | None |
| `git_pull` | Pull from remote | None |
| `git_clone` | Clone repository | `url` |
| `git_init` | Initialize repository | None |

## Error Handling

The server provides detailed error messages for common issues:
- Repository not found
- Uncommitted changes
- Merge conflicts
- Authentication failures
- Network issues

## Development

### Testing the server:
```bash
# Run directly
node src/index.js

# Test with sample commands
echo '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' | node src/index.js
```

### Common Issues

1. **"Not a git repository"**: Ensure you're in a git repository or provide the `path` parameter
2. **Authentication errors**: Configure git credentials or SSH keys
3. **Push/pull failures**: Check network connection and remote repository access

## License

MIT