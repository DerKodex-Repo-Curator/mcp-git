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
        description: 'Get the status of a git repository',
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
        description: 'Show changes in the working directory',
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
        description: 'Stage files for commit',
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
        description: 'Create a commit with staged changes',
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
        description: 'List, create, or switch branches',
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
        description: 'Show commit history',
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
        description: 'Push commits to remote repository',
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
        description: 'Pull changes from remote repository',
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
        description: 'Clone a repository',
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
        description: 'Initialize a new git repository',
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