// Shared setup: route `vscode` to the mock, serve a library folder over HTTP, make temp projects.
const Module = require('module');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

const mockPath = path.join(__dirname, 'vscode-mock.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? mockPath : resolve.call(this, request, ...rest);
};

const vscode = require('vscode');
const out = path.join(__dirname, '..', 'out');
const { Library } = require(path.join(out, 'library.js'));
const { itemKey } = require(path.join(out, 'installer.js'));

async function serveLibrary(root) {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-skills-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (content !== null) fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const libraryRoot = path.resolve(process.env.LIBRARY_DIR ?? path.join(__dirname, '..', '..', 'skills-library'));
/** Skills installed in one folder's .claude/skills ('' = project root). */
const installedIn = (project, dir = '') => {
  const skillsDir = path.join(project, dir, '.claude/skills');
  return fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).sort() : [];
};
/** Skills installed anywhere: the root plus nested placement folders. */
const installed = (project) => [...installedIn(project), ...installedIn(project, 'amplify'), ...installedIn(project, 'src')].sort();

module.exports = { vscode, Library, itemKey, serveLibrary, makeProject, libraryRoot, installed, installedIn };
