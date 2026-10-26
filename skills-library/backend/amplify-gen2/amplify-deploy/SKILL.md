---
name: amplify-deploy
description: Deploys and debugs an Amplify Gen 2 backend: ampx sandbox, function logs, secrets, failed CloudFormation and circular-dependency errors. Use when asked to "deploy", "run the sandbox", "why did the deploy fail".
disable-model-invocation: true
---

# Deploy and debug the backend

**Deploying is never implied by a coding task.** It mutates real AWS resources. Run it only when the
user asked; say which stack you are about to touch.

If `package.json` defines wrapper scripts (sandbox, deploy, validate, logs) or CLAUDE.md documents a
deploy flow, use those instead of the raw commands below.

## 1. Before anything reaches AWS

```bash
npm run <typecheck script>         # the project's script; it may check several tsconfig projects
<test runner> amplify/functions/<function-name>
```

Use the project's typecheck script (it may check several tsconfig projects, e.g. frontend and backend);
`npx tsc --noEmit` at the root may skip folders the root tsconfig excludes, such as `amplify/`.

Run the project's stack validation script if it has one (often a synth plus a circular-dependency
check). Infra changes — `resource.ts`, `backend.ts`, `data/resource.ts`, auth or storage — always need
a validation or sandbox deploy before they are reported done.

## 2. Sandbox

```bash
npx ampx sandbox                                   # deploy personal stack and watch for changes
npx ampx sandbox --once                            # deploy once and exit
npx ampx sandbox --identifier <name>               # a separate named stack
npx ampx sandbox --stream-function-logs --logs-filter <function-name>
npx ampx sandbox secret set <NAME>                 # then paste the value when prompted
npx ampx sandbox secret list
```

- Watch mode stays in the foreground: run it in the background and read its output.
- It rewrites `amplify_outputs.json`; don't commit that churn unless intended.
- `npx ampx sandbox delete` destroys the stack **and its data**. Never run it without explicit consent.
- Branch environments deploy through Amplify Hosting CI (`npx ampx pipeline-deploy`). Never run
  pipeline-deploy by hand or target another branch's stack from a local shell.

## 3. Logs

```bash
npx ampx sandbox --stream-function-logs --logs-filter <function-name>
aws logs tail /aws/lambda/<physical-function-name> --since 15m --follow
aws lambda list-functions --query "Functions[?contains(FunctionName, '<function-name>')].FunctionName"
```

Get the real error before changing anything.

## 4. Reading a failure

| Symptom | Likely cause | Check |
|---|---|---|
| Sandbox aborts before deploying | Type error or synth error | The first error in the output |
| `Circular dependency between resources` | Two nested stacks reference each other | Section 5 |
| Stack `UPDATE_ROLLBACK` | A resource failed; the first `*_FAILED` event is the cause | `aws cloudformation describe-stack-events --stack-name <nested-stack>` |
| Table "replacement" in the change set | Identifier, model name or index key changed | Stop; it deletes data (`amplify-data-model`) |
| Operation returns 401 / `Unauthorized` | Missing auth rule, or function missing `allow.resource(fn)` | `data/resource.ts` |
| Operation returns `null` with no error | Resolver ignores `ctx.error`, or handler not registered | Resolver `response`, `a.handler.function` |
| `AccessDenied` at runtime | Missing grant or policy | `backend.ts` grants; needs a sandbox deploy, not a code change |
| Env var empty at runtime | `addEnvironment` missing, secret not set for this stack, or deploy-time env injection hasn't run for the function | `backend.ts`; `ampx sandbox secret list`; the injection registry and custom resource logs |
| Resource count over 500 or template over 1 MB | A nested stack is full | [reference/scaling-limits.md](reference/scaling-limits.md) |
| Another user's data, or none | User taken from arguments instead of identity | Handler or resolver identity derivation |

## 5. Circular dependencies

Amplify places resources in nested stacks (`data`, `function`, `auth`, `storage`, custom). A cycle
appears when stack A uses an output of stack B while B uses one of A — for example a function in the
`function` stack reading data tables while the data stack references that function (as a resolver or
via `allow.resource`).

Fix by moving the edge, not by adding workarounds:

1. Set `resourceGroupName: 'data'` on functions used by the data stack.
2. Create queues, rules and event sources in the consuming function's stack (`Stack.of(lambda)`),
   not in the data stack.
3. Pass values that would create a cycle at runtime instead (SSM parameter read at cold start)
   only when no structural fix exists.

The error message names the resources in the cycle; trace each one's stack.

## Where to look

- **A deploy hits a resource/size limit or a circular dependency at scale** (500 resources, 1 MB template,
  full `FunctionDirectiveStack`, regrouping functions) → read
  [reference/scaling-limits.md](reference/scaling-limits.md)

## 6. Report honestly

Say what you deployed, to which stack, and paste the real error if it failed. "Deployed successfully"
is true only after the stack update completed and the operation returned a real response.
