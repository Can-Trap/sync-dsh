// scripts/ods-deploy-agents.js
import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readText, writeText, arg } from './_lib.js';
const HARNESSES = ['claude', 'opencode', 'codex', 'pi', 'devin', 'gemini', 'dsh'];
const harness = arg('--harness') || 'claude'; const dest = arg('--dest');
if (!dest) { console.error(`usage: ods-deploy-agents.js --dest <dir> [--harness ${HARNESSES.join('|')}]`); process.exit(2); }
if (!HARNESSES.includes(harness)) { console.error(`[ods] unknown harness "${harness}" — valid: ${HARNESSES.join(', ')}`); process.exit(2); }
const agentsDir = new URL('../agents/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
for (const f of files) {
  const name = basename(f, '.md'); const body = readText(join(agentsDir, f));
  if (harness === 'codex') {
    const desc = (body.match(/description:\s*(.+)/) || [, name])[1].replace(/"/g, "'");
    writeText(join(dest, name + '.toml'), `name = "${name}"\ndescription = "${desc}"\n# body:\n# ${body.split('\n').join('\n# ')}\n`);
  } else if (harness === 'opencode') {
    writeText(join(dest, name + '.md'), body.replace(/^---\n/, '---\nmode: subagent\n'));
  } else if (harness === 'dsh') {
    // A DeepSeek Harness subagent is dispatched with its body as the prompt itself
    // (the `subagent` / `subagent_fork` tools take a prompt, not a registered agent
    // id), so there is no per-agent front-matter dialect to translate into. The
    // front-matter is kept, not stripped: it is what a dispatcher reads to pick one.
    writeText(join(dest, name + '.md'), body);
  } else {
    // claude | pi | devin | gemini: plain markdown agent/playbook body as-is
    writeText(join(dest, name + '.md'), body);
  }
}
const mcp = {
  claude: '.mcp.json / claude mcp add open-design',
  opencode: 'opencode MCP config',
  codex: '~/.codex config',
  pi: 'CLI + README (no mcpServers)',
  devin: 'no MCP — paste as Devin knowledge/playbooks; agent shells out to the OD daemon HTTP API',
  gemini: 'gemini CLI settings.json mcpServers',
  dsh: 'the od-mcp row this repo ships in cordis.patch.yml — plugin_manager set_plugin od-mcp enabled:true',
}[harness];
console.log(`[ods] deployed ${files.length} agents to ${dest} (${harness}); wire OD MCP via: ${mcp}`);
