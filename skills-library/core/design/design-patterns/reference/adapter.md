# Adapter

**Use when:** core code talks to a third-party SDK, HTTP API or legacy module whose types/errors you don't own.
**Don't when:** wrapping your own code 1:1; change the code instead.
**Lighter first:** a few plain functions that take the SDK client and return your domain types.

## Shape

```ts
export type InvoiceStore = { put(invoice: Invoice): Promise<void> };

export const makeS3InvoiceStore = (s3: S3Client, bucket: string): InvoiceStore => ({
  async put(invoice) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: invoice.id, Body: JSON.stringify(invoice) }));
    } catch (err) {
      throw new StorageUnavailableError('invoice put failed', { cause: err });
    }
  },
});
```

## Rules

- Translate types AND errors: no SDK types, enums or error classes cross the port.
- Always adapt SDKs you'd otherwise mock: don't mock types you don't own; mock your port.
- Accept the SDK client as a constructor arg; the composition root creates and shares it.
- The port is owned by the consumer and shaped by its needs, not by the SDK's surface.
- Keep adapters thin: mapping and error translation only, no business rules.

## Test it

- Contract-test each adapter against the real service (or local emulator) in a separate integration suite.
- Core logic tests use an in-memory fake of the port.

**Related:** `ports-and-adapters`, `repository`, `error-handling`
