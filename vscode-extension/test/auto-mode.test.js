// Auto mode: only matching modules and skills, follows dependency changes, overrides, undo.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { vscode, Library, serveLibrary, makeProject, libraryRoot, installed } = require('./harness');

(async () => {
  const library = await serveLibrary(libraryRoot);
  const project = process.env.PROJECT_DIR ?? makeProject({
    'package.json': {
      dependencies: { react: '1', next: '1', '@aws-amplify/backend': '1', '@mui/material': '1', '@openrouter/sdk': '1', '@aws-sdk/lib-dynamodb': '1' },
      devDependencies: { typescript: '1', jest: '1' },
      scripts: { quality: 'node scripts/quality/check-changed.mjs' },
    },
    'amplify/functions/send-receipt/handler.ts': 'export const handler = async () => {};\n',
    'amplify/data/resource.ts': 'export const schema = {};\n',
    'src/app/page.tsx': 'export default function Page() { return null; }\n',
    'src/sections/orders/order-form.tsx': "import { useForm } from 'react-hook-form';\n",
    '.storybook/main.ts': 'export default {};\n',
  });
  const claudeDir = path.join(project, '.claude');
  fs.rmSync(claudeDir, { recursive: true, force: true });
  vscode.__state.folder = project;
  vscode.__state.config = { sources: [{ name: 'Shared', url: library.url }] };

  try {
    const lib = new Library();
    await lib.reload();
    assert.deepEqual(lib.problems, []);
    assert.ok(lib.hasDetectedStack());

    const started = Date.now();
    await lib.editManifest(() => {}, { autoDetect: true });
    const detectMs = Date.now() - started;
    await lib.sync(() => {});
    const skills = installed(project);
    console.log(`detect + plan ${detectMs} ms · installed ${skills.length} skills · budget`, lib.budget());
    console.log('skipped:', [...lib.plan.skipped.values()].map((i) => i.entry.name).sort().join(' '));

    for (const s of ['react-forms', 'amplify-lambda', 'amplify-data-model', 'lambda-standards', 'llm-functions',
      'dynamodb-access-patterns', 'nextjs-routing', 'quality-gate', 'storybook-stories', 'dependency-injection',
      'design-principles', 'design-patterns']) {
      assert.ok(skills.includes(s), `expected ${s}`);
    }
    for (const s of ['nextjs-server-action', 'fix-import-boundary', 'e2e-tests', 'dart-idioms']) {
      assert.ok(!skills.includes(s), `did not expect ${s}`);
    }
    assert.ok(fs.existsSync(path.join(claudeDir, 'skills/design-patterns/reference/strategy.md')), 'references installed');
    const manifest = JSON.parse(fs.readFileSync(path.join(claudeDir, 'skills.json'), 'utf8'));
    assert.equal(manifest.autoDetect, true);
    assert.equal(manifest.modules, undefined, 'auto manifest lists no modules');

    // A new tool appears, then goes away: its skills follow.
    fs.writeFileSync(path.join(project, 'playwright.config.ts'), 'export default {};\n');
    await lib.refresh();
    assert.ok(lib.plan.install.some((i) => i.entry.name === 'e2e-tests'));
    await lib.sync(() => {});
    assert.ok(installed(project).includes('e2e-tests'));
    fs.rmSync(path.join(project, 'playwright.config.ts'));
    await lib.refresh();
    await lib.sync(() => {});
    assert.ok(!installed(project).includes('e2e-tests'));

    // Overrides survive re-detection.
    await lib.editManifest((m) => { m.excludeModules.shared = ['frontend/mui']; m.include.push('nextjs-server-action'); });
    await lib.sync(() => {});
    assert.ok(!installed(project).includes('mui-components'));
    assert.ok(installed(project).includes('nextjs-server-action'));
    assert.equal(lib.moduleState(lib.catalogs[0], 'frontend/mui'), 'off');

    await lib.teardown();
    assert.ok(!fs.existsSync(path.join(claudeDir, 'skills.json')));
    assert.deepEqual(installed(project), []);
    console.log('auto-mode: PASSED');
  } finally {
    library.close();
    if (!process.env.PROJECT_DIR) fs.rmSync(project, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exit(1); });
