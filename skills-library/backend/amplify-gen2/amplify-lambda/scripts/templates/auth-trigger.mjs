// Templates for Cognito auth triggers (--trigger auth). Amplify's convention puts these under
// amplify/auth/<name>/, registers them in defineAuth({ triggers }) and gives them data access through
// the Data API (allow.resource) instead of table grants, so the repository wraps a model client.

export const AUTH_MODEL = 'UserProfile';

export function authHandlerTs({ name, pascalName, camelName, lg }) {
  return `// Composition root: validate the event, build dependencies once, call the service.
// No business logic and no data access here. See the amplify-backend-standards skill.
import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/${name}';
import { z } from 'zod';
${lg.imports}import type { Schema } from '../../data/resource';
import { ${pascalName}Repository } from './repositories/${name}-repository';
import { ${pascalName}Service, type I${pascalName}Service } from './services/${name}-service';
import type { Logger } from './types';

const FUNCTION_NAME = '${name}';
// TODO: the model this trigger writes. Must exist in amplify/data/resource.ts.
const MODEL = '${AUTH_MODEL}' as const;

// ---- Module scope: built once per container, shared by every invocation -------------------
${lg.setup}

let service: I${pascalName}Service | undefined;
// Built on first use inside an invocation, so a configuration failure surfaces with a request id.
async function buildService(): Promise<I${pascalName}Service> {
  if (service) return service;
  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
  Amplify.configure(resourceConfig, libraryOptions);
  const model = generateClient<Schema>().models[MODEL];
  service = new ${pascalName}Service(new ${pascalName}Repository(model), logger);
  return service;
}

const attributesSchema = z.object({ sub: z.string().min(1), email: z.string().email() });

// Post-confirmation trigger. For another Cognito trigger, change the handler type (PreSignUpTriggerHandler,
// PreTokenGenerationTriggerHandler, ...) and the key in defineAuth({ triggers }).
export const handler: PostConfirmationTriggerHandler = async (event, context) => {
${lg.perRequest}
  // The trigger also fires after a forgotten-password reset; only a new sign-up needs work.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;
  const attributes = attributesSchema.parse(event.request.userAttributes);
  await (await buildService()).${camelName}({ id: attributes.sub, email: attributes.email });
  return event; // Cognito triggers must return the event, or sign-up fails.
};
`;
}

export function authTypesTs({ pascalName }) {
  return `/** Validated input to the service. Built by the handler from the Cognito event. */
export interface ${pascalName}Input {
  id: string;
  email: string;
}

export interface ${pascalName}Result {
  id: string;
  created: boolean;
}

/** The fields this function writes. Keep it a subset of the model's create input (Amplify sets timestamps). */
export interface ${pascalName}Record {
  id: string;
  email: string;
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
`;
}

export function authServiceTs({ name, pascalName, camelName }) {
  return `import type { I${pascalName}Repository } from '../../repositories/${name}-repository';
import type { Logger, ${pascalName}Input, ${pascalName}Result } from '../../types';
import type { I${pascalName}Service } from './interfaces';

export class ${pascalName}Service implements I${pascalName}Service {
  constructor(
    private readonly repository: I${pascalName}Repository,
    private readonly logger: Logger,
  ) {}

  // Idempotent: Cognito can retry the trigger, so an existing record is left as it is.
  async ${camelName}(input: ${pascalName}Input): Promise<${pascalName}Result> {
    if (await this.repository.exists(input.id)) {
      this.logger.info('Record already exists; nothing to do', { id: input.id });
      return { id: input.id, created: false };
    }
    await this.repository.create({ id: input.id, email: input.email });
    return { id: input.id, created: true };
  }
}
`;
}

export function authServiceTestTs({ name, pascalName, camelName, testApi }) {
  const fn = testApi.fn;
  return `${testApi.importLine}import type { I${pascalName}Repository } from '../../repositories/${name}-repository';
import type { Logger } from '../../types';
import { ${pascalName}Service } from './${name}.service';

function makeService(exists = false) {
  const repository = {
    exists: ${fn}().mockResolvedValue(exists),
    create: ${fn}().mockResolvedValue(undefined),
  } satisfies I${pascalName}Repository;
  const logger = { info: ${fn}(), warn: ${fn}(), error: ${fn}() } satisfies Logger;
  return { service: new ${pascalName}Service(repository, logger), repository };
}

describe('${pascalName}Service', () => {
  it('creates the record', async () => {
    const { service, repository } = makeService();

    const result = await service.${camelName}({ id: 'u-1', email: 'a@example.com' });

    expect(repository.create).toHaveBeenCalledWith({ id: 'u-1', email: 'a@example.com' });
    expect(result).toEqual({ id: 'u-1', created: true });
  });

  it('does nothing when the record already exists (retried trigger)', async () => {
    const { service, repository } = makeService(true);

    const result = await service.${camelName}({ id: 'u-1', email: 'a@example.com' });

    expect(repository.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'u-1', created: false });
  });
});
`;
}

export function authRepositoryInterfaceTs({ pascalName }) {
  return `import type { ${pascalName}Record } from '../../../types';

export interface I${pascalName}Repository {
  exists(id: string): Promise<boolean>;
  create(record: ${pascalName}Record): Promise<void>;
}
`;
}

export function authRepositoryTs({ pascalName }) {
  return `import type { ${pascalName}Record } from '../../types';
import type { I${pascalName}Repository } from './interfaces';

type DataResult = { data: unknown; errors?: ReadonlyArray<{ message: string }> };

/** The two Data API model calls this repository uses — the generated model client satisfies it. */
export interface ModelClient {
  get(key: { id: string }): Promise<DataResult>;
  create(record: ${pascalName}Record): Promise<DataResult>;
}

// Owns every data call for this function.
export class ${pascalName}Repository implements I${pascalName}Repository {
  constructor(private readonly model: ModelClient) {}

  async exists(id: string): Promise<boolean> {
    const { data, errors } = await this.model.get({ id });
    if (errors?.length) throw new Error(\`Failed to read record \${id}: \${errors[0].message}\`);
    return data != null;
  }

  async create(record: ${pascalName}Record): Promise<void> {
    const { errors } = await this.model.create(record);
    if (errors?.length) throw new Error(\`Failed to create record \${record.id}: \${errors[0].message}\`);
  }
}
`;
}

export function authRepositoryTestTs({ name, pascalName, testApi }) {
  const fn = testApi.fn;
  return `${testApi.importLine}import { ${pascalName}Repository, type ModelClient } from './${name}.repository';

function makeRepository(get: unknown = null, createErrors?: { message: string }[]) {
  const model = {
    get: ${fn}().mockResolvedValue({ data: get }),
    create: ${fn}().mockResolvedValue({ data: {}, errors: createErrors }),
  } satisfies ModelClient;
  return { repository: new ${pascalName}Repository(model), model };
}

describe('${pascalName}Repository', () => {
  it('reports whether the record exists', async () => {
    await expect(makeRepository({ id: 'u-1' }).repository.exists('u-1')).resolves.toBe(true);
    await expect(makeRepository(null).repository.exists('u-2')).resolves.toBe(false);
  });

  it('creates the record', async () => {
    const { repository, model } = makeRepository();
    const record = { id: 'u-1', email: 'a@example.com' };

    await repository.create(record);

    expect(model.create).toHaveBeenCalledWith(record);
  });

  it('throws when the Data API returns errors', async () => {
    const { repository } = makeRepository(null, [{ message: 'boom' }]);

    await expect(repository.create({ id: 'u-1', email: 'a@example.com' })).rejects.toThrow('boom');
  });
});
`;
}

export function authManualSteps({ name, camelName }) {
  return [
    `Register the trigger in amplify/auth/resource.ts. Don't add it to defineBackend; defineAuth includes it:
     import { ${camelName} } from './${name}/resource';
     export const auth = defineAuth({ /* existing config */ triggers: { postConfirmation: ${camelName} } });`,
    `Give it data access in amplify/data/resource.ts (this also injects the env it needs):
     import { ${camelName} } from '../auth/${name}/resource';
     .authorization((allow) => [allow.resource(${camelName})])   // on the schema
     Then set MODEL in handler.ts to the model it writes, and align ${'types/index.ts'} with that model.`,
  ];
}
