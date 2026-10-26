#!/usr/bin/env node
// Scaffolds an Amplify Gen 2 Lambda function: resource.ts, a composition-root handler.ts, one service
// and one repository (each a folder with interface, index and colocated test), and shared types.
// Node built-ins only. Usage:
//   node scaffold-lambda.mjs <function-name> [--trigger graphql|sqs|eventbridge|schedule]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TRIGGERS = ['graphql', 'sqs', 'eventbridge', 'schedule'];
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
// Amplify prefixes the physical Lambda name with app/branch ids; AWS caps names at 64 characters.
const MAX_NAME_LENGTH = 40;
// AppSync gives a Lambda resolver at most 30 s; the other values are starting points to tune.
const TIMEOUT_SECONDS = { graphql: 30, sqs: 60, eventbridge: 120, schedule: 300 };

function fail(message) {
  console.error(`error: ${message}`);
  console.error('usage: node scaffold-lambda.mjs <function-name> [--trigger graphql|sqs|eventbridge|schedule]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { name: undefined, trigger: 'graphql' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--trigger') {
      args.trigger = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--trigger=')) {
      args.trigger = arg.slice('--trigger='.length);
    } else if (arg === '-h' || arg === '--help') {
      console.log('usage: node scaffold-lambda.mjs <function-name> [--trigger graphql|sqs|eventbridge|schedule]');
      process.exit(0);
    } else if (arg.startsWith('-')) {
      fail(`unknown option "${arg}"`);
    } else if (args.name) {
      fail(`unexpected extra argument "${arg}"; pass one function name`);
    } else {
      args.name = arg;
    }
  }
  if (!args.name) fail('missing <function-name>, e.g. send-receipt');
  if (!KEBAB.test(args.name)) {
    fail(`"${args.name}" is not kebab-case. Use lowercase letters, digits and single dashes, e.g. send-receipt`);
  }
  if (args.name.length > MAX_NAME_LENGTH) fail(`"${args.name}" is longer than ${MAX_NAME_LENGTH} characters`);
  if (!TRIGGERS.includes(args.trigger)) {
    fail(`unknown trigger "${args.trigger ?? ''}". Choose one of: ${TRIGGERS.join(', ')}`);
  }
  return args;
}

function findProjectRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, 'amplify')) && existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readDependencies(root) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    return new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  } catch (error) {
    fail(`could not read ${path.join(root, 'package.json')}: ${error.message}`);
  }
}

const camel = (kebab) => kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (kebab) => camel(kebab).replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

function resourceTs({ name, camelName, trigger }) {
  const extra = [];
  if (trigger === 'graphql') {
    extra.push("  // Resolver functions live in the data stack; any other group creates a circular dependency.");
    extra.push("  resourceGroupName: 'data',");
  }
  if (trigger === 'schedule') extra.push("  schedule: 'every 1h', // or a cron expression: 'cron(0 2 * * ? *)'");
  return `import { defineFunction } from '@aws-amplify/backend';

export const ${camelName} = defineFunction({
  name: '${name}',
  entry: './handler.ts',
  runtime: 22,
  architecture: 'arm64',
  memoryMB: 512,
  timeoutSeconds: ${TIMEOUT_SECONDS[trigger]},
${extra.length ? `${extra.join('\n')}\n` : ''}  // Secrets: environment: { API_KEY: secret('API_KEY') } — import secret from '@aws-amplify/backend'.
  // TABLE_NAME is set in amplify/backend.ts with addEnvironment, from the table construct.
});
`;
}

function typesTs({ pascalName }) {
  const resultType = `export interface ${pascalName}Result {\n  id: string;\n  processed: boolean;\n}\n`;
  return `// Types this function owns. Alias generated model types here instead of redeclaring them:
//   import type { Schema } from '../../../data/resource';
//   export type Order = Schema['Order']['type'];

/** Validated input to the service. Built by the handler from the event. */
export interface ${pascalName}Input {
  id: string;
}

${resultType}
/** Shape stored in the table. Replace with a Schema alias when the table is an Amplify model. */
export interface ${pascalName}Record {
  id: string;
  updatedAt?: string;
}

/** Injected so logic never calls new Date(). */
export interface Clock {
  now(): string;
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
`;
}

function serviceInterfaceTs({ pascalName, camelName }) {
  return `import type { ${pascalName}Input, ${pascalName}Result } from '../../../types';

export interface I${pascalName}Service {
  ${camelName}(input: ${pascalName}Input): Promise<${pascalName}Result>;
}
`;
}

function serviceTs({ name, pascalName, camelName }) {
  return `import type { I${pascalName}Repository } from '../../repositories/${name}-repository';
import type { Clock, Logger, ${pascalName}Input, ${pascalName}Result } from '../../types';
import type { I${pascalName}Service } from './interfaces';

export class ${pascalName}Service implements I${pascalName}Service {
  constructor(
    private readonly repository: I${pascalName}Repository,
    private readonly logger: Logger,
    private readonly clock: Clock,
  ) {}

  async ${camelName}(input: ${pascalName}Input): Promise<${pascalName}Result> {
    // Load everything up front (one parallel wave), decide, then write once at the end.
    const record = await this.repository.getById(input.id);
    if (!record) {
      this.logger.warn('Record not found; skipping', { id: input.id });
      return { id: input.id, processed: false };
    }

    // TODO: business logic. Keep this method orchestration; move record shaping into a builder unit.
    await this.repository.save({ ...record, updatedAt: this.clock.now() });
    return { id: input.id, processed: true };
  }
}
`;
}

function serviceTestTs({ name, pascalName, camelName, testApi }) {
  const fn = testApi.fn;
  return `${testApi.importLine}import type { I${pascalName}Repository } from '../../repositories/${name}-repository';
import type { Logger, ${pascalName}Record } from '../../types';
import { ${pascalName}Service } from './${name}.service';

const NOW = '2026-01-01T00:00:00.000Z';

function makeService(record: ${pascalName}Record | null = { id: 'id-1' }) {
  const repository = {
    getById: ${fn}().mockResolvedValue(record),
    save: ${fn}().mockResolvedValue(undefined),
  } satisfies I${pascalName}Repository;
  const logger = { info: ${fn}(), warn: ${fn}(), error: ${fn}() } satisfies Logger;
  const service = new ${pascalName}Service(repository, logger, { now: () => NOW });
  return { service, repository, logger };
}

describe('${pascalName}Service', () => {
  it('saves the record stamped with the clock time', async () => {
    const { service, repository } = makeService();

    const result = await service.${camelName}({ id: 'id-1' });

    expect(repository.save).toHaveBeenCalledWith({ id: 'id-1', updatedAt: NOW });
    expect(result).toEqual({ id: 'id-1', processed: true });
  });

  it('skips without writing when the record does not exist', async () => {
    const { service, repository, logger } = makeService(null);

    const result = await service.${camelName}({ id: 'missing' });

    expect(repository.save).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    expect(result).toEqual({ id: 'missing', processed: false });
  });
});
`;
}

function repositoryInterfaceTs({ pascalName }) {
  return `import type { ${pascalName}Record } from '../../../types';

export interface I${pascalName}Repository {
  getById(id: string): Promise<${pascalName}Record | null>;
  save(record: ${pascalName}Record): Promise<void>;
}
`;
}

function repositoryTs({ pascalName }) {
  return `import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ${pascalName}Record } from '../../types';
import type { I${pascalName}Repository } from './interfaces';

// Owns every table call for this function.
export class ${pascalName}Repository implements I${pascalName}Repository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getById(id: string): Promise<${pascalName}Record | null> {
    const { Item } = await this.db.send(new GetCommand({ TableName: this.tableName, Key: { id } }));
    return (Item as ${pascalName}Record | undefined) ?? null;
  }

  async save(record: ${pascalName}Record): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.tableName, Item: record }));
  }
}
`;
}

function repositoryTestTs({ name, pascalName, testApi }) {
  const fn = testApi.fn;
  return `${testApi.importLine}import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ${pascalName}Repository } from './${name}.repository';

const TABLE = 'test-table';

function makeRepository(response: Record<string, unknown> = {}) {
  const send = ${fn}().mockResolvedValue(response);
  const db = { send } as unknown as DynamoDBDocumentClient;
  return { repository: new ${pascalName}Repository(db, TABLE), send };
}

describe('${pascalName}Repository', () => {
  it('gets an item by id', async () => {
    const { repository, send } = makeRepository({ Item: { id: 'id-1' } });

    await expect(repository.getById('id-1')).resolves.toEqual({ id: 'id-1' });
    expect(send.mock.calls[0][0].input).toEqual({ TableName: TABLE, Key: { id: 'id-1' } });
  });

  it('returns null when the item does not exist', async () => {
    const { repository } = makeRepository({});

    await expect(repository.getById('missing')).resolves.toBeNull();
  });

  it('puts the record', async () => {
    const { repository, send } = makeRepository();

    await repository.save({ id: 'id-1' });

    expect(send.mock.calls[0][0].input).toEqual({ TableName: TABLE, Item: { id: 'id-1' } });
  });
});
`;
}

function unitIndexTs({ className, interfaceName, file }) {
  return `export { ${className} } from './${file}';
export type { ${interfaceName} } from './interfaces';
`;
}

function interfacesIndexTs({ interfaceName, file }) {
  return `export type { ${interfaceName} } from './${file}';
`;
}

function loggerBlock({ powertools }) {
  if (powertools) {
    return {
      imports: "import { Logger as PowertoolsLogger } from '@aws-lambda-powertools/logger';\n",
      setup: `const powertoolsLogger = new PowertoolsLogger({ serviceName: FUNCTION_NAME });
const logger: Logger = {
  info: (message, data = {}) => powertoolsLogger.info(message, data),
  warn: (message, data = {}) => powertoolsLogger.warn(message, data),
  error: (message, data = {}) => powertoolsLogger.error(message, data),
};`,
      perRequest: '  powertoolsLogger.addContext(context);',
    };
  }
  return {
    imports: '',
    setup: `// Structured JSON logs carrying the request id. Lambda runs one invocation per container at a time.
let requestId = '';
const serializeError = (_key: string, value: unknown) =>
  value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
const log = (level: 'INFO' | 'WARN' | 'ERROR') => (message: string, data?: Record<string, unknown>) =>
  console.log(JSON.stringify({ level, message, service: FUNCTION_NAME, requestId, ...data }, serializeError));
const logger: Logger = { info: log('INFO'), warn: log('WARN'), error: log('ERROR') };`,
    perRequest: '  requestId = context.awsRequestId;',
  };
}

function handlerTs({ name, pascalName, camelName, trigger, powertools }) {
  const lg = loggerBlock({ powertools });
  const awsTypes = {
    graphql: 'AppSyncResolverHandler',
    sqs: 'SQSBatchResponse, SQSHandler',
    eventbridge: 'EventBridgeHandler',
    schedule: 'EventBridgeHandler',
  }[trigger];

  const head = `// Composition root: validate the event and config, build dependencies, call the service once.
// No business logic and no data access here. See the amplify-backend-standards skill.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ${awsTypes} } from 'aws-lambda';
import { z } from 'zod';
${lg.imports}import { ${pascalName}Repository } from './repositories/${name}-repository';
import { ${pascalName}Service, type I${pascalName}Service } from './services/${name}-service';
import type { Clock, Logger${trigger === 'graphql' ? `, ${pascalName}Result` : ''} } from './types';

const FUNCTION_NAME = '${name}';

// ---- Module scope: built once per container, shared by every invocation -------------------
${lg.setup}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const systemClock: Clock = { now: () => new Date().toISOString() };

const configSchema = z.object({ TABLE_NAME: z.string().min(1) });
let config: z.infer<typeof configSchema> | undefined;
// Validated on first use inside an invocation, so a bad deploy fails with a request id, not an init error.
const loadConfig = () => (config ??= configSchema.parse(process.env));

function buildService(): I${pascalName}Service {
  const { TABLE_NAME } = loadConfig();
  return new ${pascalName}Service(new ${pascalName}Repository(dynamo, TABLE_NAME), logger, systemClock);
}
`;

  const bodies = {
    graphql: `
const argumentsSchema = z.object({ id: z.string().min(1) });

// After registering the operation in amplify/data/resource.ts, prefer the generated type:
//   export const handler: Schema['${camelName}']['functionHandler'] = async (event, context) => { ... };
export const handler: AppSyncResolverHandler<unknown, ${pascalName}Result> = async (event, context) => {
${lg.perRequest}
  // The user comes from event.identity (the auth context), never from event.arguments.
  const input = argumentsSchema.parse(event.arguments);
  return buildService().${camelName}(input);
};
`,
    sqs: `
const messageSchema = z.object({ id: z.string().min(1) });

// Requires reportBatchItemFailures: true on the event source. Delivery is at least once, so the
// service must be idempotent.
export const handler: SQSHandler = async (event, context): Promise<SQSBatchResponse> => {
${lg.perRequest}
  const service = buildService();
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const input = messageSchema.parse(JSON.parse(record.body));
      await service.${camelName}(input);
    } catch (error) {
      logger.error('Record failed', { messageId: record.messageId, error });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
`,
    eventbridge: `
const detailSchema = z.object({ id: z.string().min(1) });

// Delivery is at least once: the service must be idempotent. Configure retries and a DLQ on the rule target.
export const handler: EventBridgeHandler<string, unknown, void> = async (event, context) => {
${lg.perRequest}
  const input = detailSchema.parse(event.detail);
  await buildService().${camelName}(input);
};
`,
    schedule: `
// The item holding this job's state (for example the last processed cursor).
const JOB_STATE_ID = FUNCTION_NAME;

export const handler: EventBridgeHandler<'Scheduled Event', unknown, void> = async (event, context) => {
${lg.perRequest}
  logger.info('Scheduled run', { scheduledAt: event.time });
  await buildService().${camelName}({ id: JOB_STATE_ID });
};
`,
  };
  return head + bodies[trigger];
}

// ---------------------------------------------------------------------------------------------
// Manual steps
// ---------------------------------------------------------------------------------------------

function manualSteps({ name, camelName, pascalName, trigger }) {
  const lambda = `backend.${camelName}.resources.lambda`;
  const steps = [];
  steps.push(`Register in amplify/backend.ts (match the import style already used there, e.g. a .js suffix):
     import { ${camelName} } from './functions/${name}/resource';
     const backend = defineBackend({ /* existing resources */ ${camelName} });`);
  steps.push(`Grant table access and set TABLE_NAME in amplify/backend.ts
     (if the project injects <MODEL>_TABLE_NAME at deploy time instead, register the function there and skip this):
     const table = backend.data.resources.tables['<Model>'];
     table.grantReadWriteData(${lambda});   // grantReadData if it only reads
     backend.${camelName}.addEnvironment('TABLE_NAME', table.tableName);`);
  if (trigger === 'graphql') {
    steps.push(`Add the operation to the schema in amplify/data/resource.ts:
     import { ${camelName} } from '../functions/${name}/resource';
     ${camelName}: a
       .mutation()   // or .query() for reads
       .arguments({ id: a.id().required() })
       .returns(a.customType({ id: a.id().required(), processed: a.boolean().required() }))
       .authorization((allow) => [allow.authenticated()])
       .handler(a.handler.function(${camelName})),
     Then type the handler as Schema['${camelName}']['functionHandler'].`);
  }
  if (trigger === 'sqs') {
    steps.push(`Create the queue and event source in amplify/backend.ts (same stack as the function avoids cycles):
     import { Duration, Stack } from 'aws-cdk-lib';
     import { Queue } from 'aws-cdk-lib/aws-sqs';
     import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
     const ${camelName}Stack = Stack.of(${lambda});
     const ${camelName}Dlq = new Queue(${camelName}Stack, '${pascalName}Dlq', { retentionPeriod: Duration.days(14) });
     const ${camelName}Queue = new Queue(${camelName}Stack, '${pascalName}Queue', {
       visibilityTimeout: Duration.seconds(${TIMEOUT_SECONDS.sqs * 6}), // at least 6x the function timeout
       deadLetterQueue: { queue: ${camelName}Dlq, maxReceiveCount: 5 },
     });
     ${lambda}.addEventSource(new SqsEventSource(${camelName}Queue, { batchSize: 10, reportBatchItemFailures: true }));`);
  }
  if (trigger === 'eventbridge') {
    steps.push(`Create the rule in amplify/backend.ts (same stack as the function avoids cycles):
     import { Duration, Stack } from 'aws-cdk-lib';
     import { Rule } from 'aws-cdk-lib/aws-events';
     import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
     import { Queue } from 'aws-cdk-lib/aws-sqs';
     const ${camelName}Stack = Stack.of(${lambda});
     new Rule(${camelName}Stack, '${pascalName}Rule', {
       eventPattern: { source: ['<event.source>'], detailType: ['<DetailType>'] },
       targets: [new LambdaFunction(${lambda}, {
         retryAttempts: 2,
         maxEventAge: Duration.hours(2),
         deadLetterQueue: new Queue(${camelName}Stack, '${pascalName}Dlq'),
       })],
     });`);
  }
  if (trigger === 'schedule') {
    steps.push(`Adjust the schedule expression in resource.ts. No other wiring is needed.`);
  }
  steps.push(`If the function calls the Data API, add allow.resource(${camelName}) to the schema authorization in
     amplify/data/resource.ts${trigger === 'graphql' ? '' : " and set resourceGroupName: 'data' in resource.ts to avoid a circular dependency"}.`);
  steps.push(`Replace the TODO in services/${name}-service with the business logic, rename the input and record types in
     types/index.ts, and follow the amplify-backend-standards skill.`);
  steps.push('Typecheck, run the new tests, then validate the stack (amplify-deploy) before reporting done.');
  return steps.map((step, i) => `  ${i + 1}. ${step}`).join('\n');
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

const { name, trigger } = parseArgs(process.argv.slice(2));
const root = findProjectRoot(process.cwd());
if (!root) fail('no amplify/ folder with a package.json found here or in any parent. Run from the project root.');

const fnDir = path.join(root, 'amplify', 'functions', name);
if (existsSync(fnDir)) {
  fail(`${path.relative(root, fnDir)} already exists. Pick another name or extend the existing function by hand.`);
}

const deps = readDependencies(root);
const vitest = deps.has('vitest') && !deps.has('jest');
const testApi = vitest
  ? { fn: 'vi.fn', importLine: "import { describe, expect, it, vi } from 'vitest';\n" }
  : { fn: 'jest.fn', importLine: '' };
const ctx = {
  name,
  trigger,
  camelName: camel(name),
  pascalName: pascal(name),
  testApi,
  powertools: deps.has('@aws-lambda-powertools/logger'),
};

const serviceDir = `services/${name}-service`;
const repositoryDir = `repositories/${name}-repository`;
const files = {
  'resource.ts': resourceTs(ctx),
  'handler.ts': handlerTs(ctx),
  'types/index.ts': typesTs(ctx),
  [`${serviceDir}/${name}.service.ts`]: serviceTs(ctx),
  [`${serviceDir}/${name}.service.test.ts`]: serviceTestTs(ctx),
  [`${serviceDir}/index.ts`]: unitIndexTs({
    className: `${ctx.pascalName}Service`,
    interfaceName: `I${ctx.pascalName}Service`,
    file: `${name}.service`,
  }),
  [`${serviceDir}/interfaces/index.ts`]: interfacesIndexTs({
    interfaceName: `I${ctx.pascalName}Service`,
    file: `${name}-service.interface`,
  }),
  [`${serviceDir}/interfaces/${name}-service.interface.ts`]: serviceInterfaceTs(ctx),
  [`${repositoryDir}/${name}.repository.ts`]: repositoryTs(ctx),
  [`${repositoryDir}/${name}.repository.test.ts`]: repositoryTestTs(ctx),
  [`${repositoryDir}/index.ts`]: unitIndexTs({
    className: `${ctx.pascalName}Repository`,
    interfaceName: `I${ctx.pascalName}Repository`,
    file: `${name}.repository`,
  }),
  [`${repositoryDir}/interfaces/index.ts`]: interfacesIndexTs({
    interfaceName: `I${ctx.pascalName}Repository`,
    file: `${name}-repository.interface`,
  }),
  [`${repositoryDir}/interfaces/${name}-repository.interface.ts`]: repositoryInterfaceTs(ctx),
};

try {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(fnDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, { flag: 'wx' });
  }
} catch (error) {
  fail(`could not write files under ${fnDir}: ${error.message}`);
}

console.log(`Created amplify/functions/${name}/ (trigger: ${trigger})`);
for (const rel of Object.keys(files)) console.log(`  ${rel}`);

const missing = [
  ['zod', 'zod'],
  ['@aws-sdk/lib-dynamodb', '@aws-sdk/lib-dynamodb'],
  ['@aws-sdk/client-dynamodb', '@aws-sdk/client-dynamodb'],
  ['@types/aws-lambda', '@types/aws-lambda'],
].filter(([dep]) => !deps.has(dep));
if (missing.length) {
  console.log(`\nMissing from package.json (the generated code imports them): ${missing.map(([, pkg]) => pkg).join(', ')}`);
  console.log(`  npm install ${missing.map(([, pkg]) => pkg).join(' ')}`);
}

console.log(`\nRemaining manual steps:\n${manualSteps(ctx)}`);
