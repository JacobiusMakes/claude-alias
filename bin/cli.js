#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json');
const HOOK_SRC = resolve(__dirname, '..', 'hooks', 'inject-env.sh');
const HOOK_DEST = join(HOME, '.claude', 'hooks', 'claude-alias-inject-env.sh');

const HOOK_ENTRY = {
  matcher: 'Bash',
  hooks: [
    {
      type: 'command',
      command: HOOK_DEST,
    },
  ],
};

// ── helpers ────────────────────────────────────────────────────────────────

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    console.error(`Error reading ${SETTINGS_PATH}`);
    process.exit(1);
  }
}

function writeSettings(obj) {
  const dir = dirname(SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function installHookFile() {
  const hooksDir = dirname(HOOK_DEST);
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  const src = readFileSync(HOOK_SRC, 'utf8');
  writeFileSync(HOOK_DEST, src, { mode: 0o755 });
}

function removeHookFile() {
  if (existsSync(HOOK_DEST)) {
    rmSync(HOOK_DEST);
  }
}

function isInstalled(settings) {
  const preToolUse = settings?.hooks?.PreToolUse ?? [];
  return preToolUse.some(
    (entry) =>
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => h.command === HOOK_DEST)
  );
}

// Parse variable names from an env file (skip comments and blank lines)
function parseVarNames(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const names = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=/) ||
                  line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) names.push(match[1]);
  }
  return names;
}

function detectEnvFile(dir) {
  const candidates = ['.claude-env', '.env.claude', '.env.local', '.env'];
  for (const f of candidates) {
    const p = join(dir, f);
    if (existsSync(p)) return { name: f, path: p };
  }
  return null;
}

function projectKey(dir) {
  return dir.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ── commands ───────────────────────────────────────────────────────────────

function cmdInstall() {
  installHookFile();

  const settings = readSettings();
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];

  if (isInstalled(settings)) {
    console.log('claude-alias is already installed.');
    return;
  }

  settings.hooks.PreToolUse.push(HOOK_ENTRY);
  writeSettings(settings);
  console.log('claude-alias installed.');
  console.log(`  Hook file : ${HOOK_DEST}`);
  console.log(`  Settings  : ${SETTINGS_PATH}`);
  console.log('');
  console.log('Run `claude-alias init` inside a project to create a .claude-env template.');
}

function cmdUninstall() {
  const settings = readSettings();
  const preToolUse = settings?.hooks?.PreToolUse ?? [];
  const before = preToolUse.length;

  if (!settings.hooks) settings.hooks = {};
  settings.hooks.PreToolUse = preToolUse.filter(
    (entry) =>
      !(
        Array.isArray(entry.hooks) &&
        entry.hooks.some((h) => h.command === HOOK_DEST)
      )
  );

  if (settings.hooks.PreToolUse.length === before) {
    console.log('claude-alias is not installed in settings.json.');
  } else {
    writeSettings(settings);
    console.log('Removed hook entry from settings.json.');
  }

  removeHookFile();
  console.log('claude-alias uninstalled.');
}

function cmdStatus() {
  const cwd = process.cwd();
  const settings = readSettings();
  const installed = isInstalled(settings);

  console.log(`claude-alias status`);
  console.log(`  Installed : ${installed ? 'yes' : 'no — run `claude-alias install`'}`);
  console.log(`  CWD       : ${cwd}`);
  console.log('');

  const found = detectEnvFile(cwd);
  if (found) {
    console.log(`  Env file  : ${found.name}  (${found.path})`);
    const vars = parseVarNames(found.path);
    if (vars.length === 0) {
      console.log('  Variables : (none defined)');
    } else {
      console.log(`  Variables : ${vars.join(', ')}`);
    }
  } else {
    console.log('  Env file  : none found (.claude-env, .env.claude, .env.local, .env)');
  }

  const key = projectKey(cwd);
  const aliasFile = join(HOME, '.claude-alias', `${key}.env`);
  if (existsSync(aliasFile)) {
    const aliasVars = parseVarNames(aliasFile);
    console.log('');
    console.log(`  Alias file: ${aliasFile}`);
    console.log(`  Variables : ${aliasVars.length > 0 ? aliasVars.join(', ') : '(none defined)'}`);
  }
}

function cmdInit() {
  const target = join(process.cwd(), '.claude-env');
  if (existsSync(target)) {
    console.log(`.claude-env already exists at ${target}`);
    return;
  }
  const template = `# Claude Code Environment Variables
# These are automatically loaded when Claude uses the Bash tool
# Add project-specific paths, API keys, tool configs, etc.

# Example:
# PATH=$PATH:/usr/local/custom/bin
# API_BASE_URL=http://localhost:3000
# NODE_ENV=development
`;
  writeFileSync(target, template, 'utf8');
  console.log(`Created .claude-env at ${target}`);
  console.log('Edit it to add your project-specific environment variables.');
  console.log('');
  console.log('Tip: add .claude-env to .gitignore if it contains secrets.');
}

function cmdShow() {
  const cwd = process.cwd();
  console.log(`Variables that would be injected in: ${cwd}`);
  console.log('');

  const found = detectEnvFile(cwd);
  if (found) {
    const vars = parseVarNames(found.path);
    console.log(`From ${found.name}:`);
    if (vars.length === 0) {
      console.log('  (no variables defined)');
    } else {
      for (const v of vars) console.log(`  ${v}`);
    }
  } else {
    console.log('No env file found (.claude-env, .env.claude, .env.local, .env)');
  }

  const key = projectKey(cwd);
  const aliasFile = join(HOME, '.claude-alias', `${key}.env`);
  if (existsSync(aliasFile)) {
    const vars = parseVarNames(aliasFile);
    console.log('');
    console.log(`From ~/.claude-alias/${key}.env:`);
    if (vars.length === 0) {
      console.log('  (no variables defined)');
    } else {
      for (const v of vars) console.log(`  ${v}`);
    }
  }
}

function cmdHelp() {
  console.log(`claude-alias — project-specific env for Claude Code

Usage:
  claude-alias install    Install hooks into ~/.claude/settings.json
  claude-alias uninstall  Remove hooks
  claude-alias status     Show detected env files and loaded variable names
  claude-alias init       Create a .claude-env template in the current project
  claude-alias show       Show which env vars would be injected (names only)
  claude-alias help       Show this help

Env file search order (first match wins):
  .claude-env  →  .env.claude  →  .env.local  →  .env

Per-project global aliases: ~/.claude-alias/<project-key>.env
`);
}

// ── main ───────────────────────────────────────────────────────────────────

const [,, cmd] = process.argv;

switch (cmd) {
  case 'install':    cmdInstall();   break;
  case 'uninstall':  cmdUninstall(); break;
  case 'status':     cmdStatus();    break;
  case 'init':       cmdInit();      break;
  case 'show':       cmdShow();      break;
  case 'help':
  case '--help':
  case '-h':
  default:           cmdHelp();      break;
}
