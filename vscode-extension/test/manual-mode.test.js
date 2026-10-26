// Manual manifest: requires, hand-made skills, exclusions, module removal, a teammate cloning the repo.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { vscode, Library, itemKey, serveLibrary, makeProject, libraryRoot, installed } = require('./harness');

(async () => {
  const library = await serveLibrary(libraryRoot);
  const project = makeProject({
    'package.json': {
      dependencies: { react: '1', next: '1', '@aws-amplify/backend': '1', '@mui/material': '1' },
      devDependencies: { typescript: '1', jest: '1' },
    },
    'amplify/functions/send-receipt/handler.ts': '',
    'amplify/data/resource.ts': '',
    '.claude/skills/my-own-skill/SKILL.md': 'mine',
  });
  vscode.__state.folder = project;
  vscode.__state.config = { sources: [{ name: 'Shared', url: library.url }], installScope: 'workspace' };

  try {
    const lib = new Library();
    await lib.reload();
    assert.deepEqual(lib.problems, []);
    const catalog = lib.catalogs[0];
    assert.ok(lib.suggestedModules(catalog).includes('backend/amplify-gen2'));
    assert.ok(!lib.suggestedModules(catalog).includes('languages/dart'));

    await lib.editManifest((m) => { m.modules.shared = ['backend/amplify-gen2']; });
    const selected = [...lib.selections.get(catalog).keys()];
    for (const id of ['backend/aws-lambda', 'data/dynamodb', 'languages/typescript', 'core/quality', 'core/design']) {
      assert.ok(selected.includes(id), `requires pulled in ${id}`);
    }
    assert.equal(lib.moduleState(catalog, 'backend/amplify-gen2'), 'added');
    assert.equal(lib.moduleState(catalog, 'data/dynamodb'), 'required');

    const result = await lib.sync(() => {});
    assert.deepEqual(result.failures, []);
    assert.ok(installed(project).includes('amplify-lambda'));
    assert.ok(!installed(project).includes('dynamodb-access-patterns'), 'no direct DynamoDB SDK → skipped');
    assert.ok(fs.existsSync(path.join(project, '.claude/agents/design-reviewer.md')), 'agent installed');
    assert.ok(lib.local.has(itemKey('skill', 'my-own-skill')), 'hand-made skill left alone');

    await lib.editManifest((m) => { m.exclude.push('amplify-deploy'); });
    await lib.sync(() => {});
    assert.ok(!installed(project).includes('amplify-deploy'));

    await lib.editManifest((m) => { m.modules.shared = []; });
    await lib.sync(() => {});
    assert.deepEqual(installed(project), ['my-own-skill']);

    // A teammate clones: manifest present, nothing installed yet.
    await lib.editManifest((m) => { m.modules.shared = ['frontend/nextjs']; });
    fs.rmSync(path.join(project, '.claude/claude-skills.lock.json'), { force: true });
    const teammate = new Library();
    await teammate.reload();
    assert.ok(teammate.plan.install.length > 0);
    console.log('manual-mode: PASSED');
  } finally {
    library.close();
    fs.rmSync(project, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exit(1); });
