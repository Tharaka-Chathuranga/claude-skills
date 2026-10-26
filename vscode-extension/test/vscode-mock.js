// Minimal stand-in for the parts of the VS Code API the Library uses, so its logic runs under plain Node.
const fs = require('fs/promises');
const path = require('path');

class Uri {
  constructor(p) { this.fsPath = p; this.path = p; }
  static file(p) { return new Uri(path.resolve(p)); }
  static joinPath(base, ...parts) { return new Uri(path.join(base.fsPath, ...parts)); }
  toString() { return `file://${this.fsPath}`; }
}
const FileType = { File: 1, Directory: 2 };
const state = { folder: undefined, config: {} };

module.exports = {
  Uri,
  FileType,
  ConfigurationTarget: { Global: 1 },
  authentication: { getSession: async () => ({ accessToken: 'test' }) },
  EventEmitter: class {
    constructor() { this.listeners = []; this.event = (l) => { this.listeners.push(l); return { dispose() {} }; }; }
    fire(v) { this.listeners.forEach((l) => l(v)); }
    dispose() {}
  },
  workspace: {
    get workspaceFolders() { return state.folder ? [{ uri: Uri.file(state.folder) }] : undefined; },
    getConfiguration: () => ({
      get: (key, fallback) => (key in state.config ? state.config[key] : fallback),
      update: async (key, value) => { state.config[key] = value; },
    }),
    asRelativePath: (uri) => uri.fsPath,
    fs: {
      stat: (uri) => fs.stat(uri.fsPath),
      readFile: async (uri) => new Uint8Array(await fs.readFile(uri.fsPath)),
      writeFile: (uri, bytes) => fs.writeFile(uri.fsPath, bytes),
      createDirectory: (uri) => fs.mkdir(uri.fsPath, { recursive: true }).then(() => undefined),
      readDirectory: async (uri) =>
        (await fs.readdir(uri.fsPath, { withFileTypes: true })).map((e) => [e.name, e.isDirectory() ? FileType.Directory : FileType.File]),
      delete: async (uri) => { await fs.stat(uri.fsPath); await fs.rm(uri.fsPath, { recursive: true, force: true }); },
    },
  },
  __state: state,
};
