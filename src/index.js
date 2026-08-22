#!/usr/bin/env node
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

const server = new Server(
  {
    name: 'mcp-git',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to execute git commands
async function executeGitCommand(command, cwd = process.cwd()) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    if (stderr && !stderr.includes('warning:')) {
      throw new Error(stderr);
    }
    return stdout.trim();
  } catch (error) {
    throw new Error(`Git command failed: ${error.message}`);
  }
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'git_status',
        description: 'Status of a repository, as structured output. SCOPE OF THIS WHOLE SERVER, read once: it wraps eleven common git operations and nothing else. Anything past them -- rebase, stash, tag, remote, cherry-pick, reset, blame, worktree, submodules, gh, or any flag these tools do not expose -- needs system_exec running the real git CLI, which also has Mikey\'s SSH keys and credentials. In practice system_exec is what gets used; these are here for when structured output is genuinely easier to act on than parsing text.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository (defaults to current directory)',
            },
            short: {
              type: 'boolean',
              description: 'Show short format status',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_diff',
        description: 'Show unstaged changes, or staged with staged:true, optionally for one file. For anything with a range or a flag (git diff A..B, --stat, --name-only) use system_exec.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository',
            },
            staged: {
              type: 'boolean',
              description: 'Show staged changes instead of unstaged',
              default: false,
            },
            file: {
              type: 'string',
              description: 'Specific file to show diff for',
            },
          },
        },
      },
      {
        name: 'git_add',
        description: 'Stage files for commit; pass ["."] for everything. Check what you are staging first -- Mikey keeps cruft out via .gitignore (no __pycache__, *.pyc, *.bak-*, runtime state, ledgers, locks), and staging "." in a repo with a gap in its .gitignore is how that gets committed.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository',
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to stage (use ["."] for all files)',
            },
          },
          required: ['files'],
        },
      },
      {
        name: 'git_commit',
        description: 'Commit what is staged. Standing instruction from Mikey, 2026-06-26: "Always update git. You don\'t need to ask for that." So COMMIT AND PUSH autonomously when work leaves changes -- never surface uncommitted files as a question for him. Write a real message saying what changed and why, not just what.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository',
            },
            message: {
              type: 'string',
              description: 'Commit message',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'git_branch',
        description: 'List, create, switch, or delete branches. Note his repos are not uniform: mcp-protocols is on master, most others are on main -- check rather than assuming. Merging is not here; that is system_exec.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository',
            },
            action: {
              type: 'string',
              enum: ['list', 'create', 'switch', 'delete'],
              description: 'Branch operation to perform',
              default: 'list',
            },
            name: {
              type: 'string',
              description: 'Branch name (for create/switch/delete)',
            },
          },
        },
      },
      {
        name: 'git_log',
        description: 'Recent commit history for a repository. Use it to check whether something was ALREADY DONE before redoing it -- several times a stale note claimed work was outstanding that a commit showed finished days earlier. For formatting or filtering (--oneline, --since, -- path) use system_exec.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository',
            },
            limit: {
              type: 'number',
              description: 'Number of commits to show',
              default: 10,
            },
            oneline: {
              type: 'boolean',
              description: 'Show compact one-line format',
              default: true,
            },
          },
        },
      },
      {
        name: 'git_push',
        description: 'Push commits to the remote. Part of the same standing instruction as git_commit: push without asking. His remotes are SSH (git@github.com:MikeyBeez/...). ONE EXCEPTION: ~/Code/docs has NO REMOTE ON PURPOSE -- it holds un-anonymized personal material and a pre-push scan guards it. Do not add a remote to that repo; that call is Mikey\'s alone.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository',
            },
            remote: {
              type: 'string',
              description: 'Remote name',
              default: 'origin',
            },
            branch: {
              type: 'string',
              description: 'Branch to push (defaults to current branch)',
            },
            force: {
              type: 'boolean',
              description: 'Force push',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_pull',
        description: 'Pull changes from the remote. Can fail with conflicts or refuse on a dirty tree, and this wrapper cannot resolve either -- when it does, switch to system_exec and handle it with the real CLI rather than retrying.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the git repository',
            },
            remote: {
              type: 'string',
              description: 'Remote name',
              default: 'origin',
            },
            branch: {
              type: 'string',
              description: 'Branch to pull',
            },
          },
        },
      },
      {
        name: 'git_clone',
        description: 'Clone a repository. Mikey\'s standing rule for third-party code, 2026-07-28: FORK AND CLONE BEFORE EVALUATING IT -- read the source, do not judge a package from its README or --help. Third-party clones go in ~/Code/third_party. Forking needs gh, which means system_exec.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Repository URL to clone',
            },
            path: {
              type: 'string',
              description: 'Directory to clone into',
            },
            depth: {
              type: 'number',
              description: 'Create a shallow clone with history truncated to this number of commits',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'git_init',
        description: 'Initialize a new git repository. Before the first commit, write the .gitignore -- his standard exclusions are __pycache__/, *.pyc, *.bak, *.bak-*, and any runtime state, ledger, or lock files. A repo that will ever hold personal material should also get a pre-push scan (see ~/Code/harness/prepush-scan.sh) rather than a remote.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path where to initialize the repository',
            },
            bare: {
              type: 'boolean',
              description: 'Create a bare repository',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_help',
        description: 'Full documentation for every tool in this server, with examples. Remember it documents these eleven wrappers only, not git itself.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const repoPath = args.path || process.cwd();

  try {
    switch (name) {
      case 'git_status': {
        const shortFlag = args.short ? '-s' : '';
        const result = await executeGitCommand(`git status ${shortFlag}`, repoPath);
        return {
          content: [{
            type: 'text',
            text: result || 'Working tree clean',
          }],
        };
      }

      case 'git_diff': {
        let command = 'git diff';
        if (args.staged) command += ' --staged';
        if (args.file) command += ` -- ${args.file}`;
        
        const result = await executeGitCommand(command, repoPath);
        return {
          content: [{
            type: 'text',
            text: result || 'No changes',
          }],
        };
      }

      case 'git_add': {
        const files = args.files.join(' ');
        await executeGitCommand(`git add ${files}`, repoPath);
        return {
          content: [{
            type: 'text',
            text: `Staged files: ${files}`,
          }],
        };
      }

      case 'git_commit': {
        const result = await executeGitCommand(
          `git commit -m "${args.message.replace(/"/g, '\\"')}"`,
          repoPath
        );
        return {
          content: [{
            type: 'text',
            text: result,
          }],
        };
      }

      case 'git_branch': {
        let command;
        switch (args.action) {
          case 'create':
            if (!args.name) throw new Error('Branch name required for create');
            command = `git branch ${args.name}`;
            break;
          case 'switch':
            if (!args.name) throw new Error('Branch name required for switch');
            command = `git checkout ${args.name}`;
            break;
          case 'delete':
            if (!args.name) throw new Error('Branch name required for delete');
            command = `git branch -d ${args.name}`;
            break;
          default:
            command = 'git branch';
        }
        
        const result = await executeGitCommand(command, repoPath);
        return {
          content: [{
            type: 'text',
            text: result || 'Operation completed',
          }],
        };
      }

      case 'git_log': {
        const limitFlag = `--max-count=${args.limit}`;
        const formatFlag = args.oneline ? '--oneline' : '';
        const result = await executeGitCommand(
          `git log ${limitFlag} ${formatFlag}`,
          repoPath
        );
        return {
          content: [{
            type: 'text',
            text: result || 'No commits yet',
          }],
        };
      }

      case 'git_push': {
        let command = `git push ${args.remote}`;
        if (args.branch) command += ` ${args.branch}`;
        if (args.force) command += ' --force';
        
        const result = await executeGitCommand(command, repoPath);
        return {
          content: [{
            type: 'text',
            text: result || 'Push completed',
          }],
        };
      }

      case 'git_pull': {
        let command = `git pull ${args.remote}`;
        if (args.branch) command += ` ${args.branch}`;
        
        const result = await executeGitCommand(command, repoPath);
        return {
          content: [{
            type: 'text',
            text: result || 'Already up to date',
          }],
        };
      }

      case 'git_clone': {
        let command = `git clone ${args.url}`;
        if (args.path) command += ` ${args.path}`;
        if (args.depth) command += ` --depth ${args.depth}`;
        
        const result = await executeGitCommand(command, process.cwd());
        return {
          content: [{
            type: 'text',
            text: `Repository cloned: ${result}`,
          }],
        };
      }

      case 'git_init': {
        const bareFlag = args.bare ? '--bare' : '';
        const result = await executeGitCommand(
          `git init ${bareFlag}`,
          repoPath
        );
        return {
          content: [{
            type: 'text',
            text: result,
          }],
        };
      }

      case 'git_help': {
        const helpText = `
# 🔧 Git MCP Server Help

## Purpose
Provides comprehensive git version control operations for Claude - status, diff, commit, branch management, and more.

## Available Tools

### git_status
Get the status of a git repository:
- **path**: Repository path (defaults to current directory)
- **short**: Show short format status

### git_diff  
Show changes in the working directory:
- **path**: Repository path
- **staged**: Show staged changes instead of unstaged
- **file**: Specific file to show diff for

### git_add
Stage files for commit:
- **path**: Repository path
- **files**: Files to stage (use ["."] for all files)

### git_commit
Create a commit with staged changes:
- **path**: Repository path  
- **message**: Commit message (required)

### git_branch
List, create, or switch branches:
- **path**: Repository path
- **action**: list | create | switch | delete (default: list)
- **name**: Branch name (for create/switch/delete)

### git_log
Show commit history:
- **path**: Repository path
- **limit**: Number of commits to show (default: 10)
- **oneline**: Show compact one-line format (default: true)

### git_push
Push commits to remote repository:
- **path**: Repository path
- **remote**: Remote name (default: origin)
- **branch**: Branch to push (defaults to current branch)
- **force**: Force push (default: false)

### git_pull
Pull changes from remote repository:
- **path**: Repository path
- **remote**: Remote name (default: origin)  
- **branch**: Branch to pull

### git_clone
Clone a repository:
- **url**: Repository URL to clone (required)
- **path**: Directory to clone into
- **depth**: Create shallow clone with history truncated

### git_init
Initialize a new git repository:
- **path**: Path where to initialize repository
- **bare**: Create a bare repository (default: false)

## Common Workflows

### Check Status & Stage Changes
1. git_status - see current state
2. git_diff - review changes  
3. git_add - stage files
4. git_commit - create commit

### Branch Management
1. git_branch - list branches
2. git_branch (action: create, name: feature) - create branch
3. git_branch (action: switch, name: feature) - switch to branch

### Remote Operations
1. git_pull - get latest changes
2. git_push - share your commits

## Error Handling
All operations include comprehensive error handling with descriptive messages.
Commands are executed in the specified repository path context.
`;
        return {
          content: [{
            type: 'text',
            text: helpText
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`,
      }],
      isError: true,
    };
  }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);
console.error('mcp-git MCP server running on stdio');