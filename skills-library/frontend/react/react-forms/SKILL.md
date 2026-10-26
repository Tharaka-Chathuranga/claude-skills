---
name: react-forms
description: Builds React forms with react-hook-form and zod: translated validation, field components, submit and server errors, create vs edit defaults. Use when adding a form, a create/edit dialog or field validation.
---

# React forms

Default stack: react-hook-form + `zodResolver` + the project's form field components. If the project
uses a different form library, follow it and keep the rules below.

## Schema in a hook

Build the zod schema inside a hook so messages go through translation:

```ts
export function useInvoiceSchema() {
  const t = useTranslations('Invoices');
  return useMemo(
    () =>
      z.object({
        customerName: z.string().min(1, { message: t('validation.customerRequired') }),
        amount: z.number().positive({ message: t('validation.amountPositive') }),
      }),
    [t]
  );
}
export type InvoiceFormValues = z.infer<ReturnType<typeof useInvoiceSchema>>;
```

No hardcoded English in validation messages. Derive the form type from the schema, never by hand.

## The form

```tsx
const schema = useInvoiceSchema();
const methods = useForm<InvoiceFormValues>({
  resolver: zodResolver(schema),
  defaultValues: invoice ? toFormValues(invoice) : EMPTY_INVOICE,
});
const { handleSubmit, formState: { isSubmitting } } = methods;

const onSubmit = handleSubmit(async (values) => {
  try {
    await saveInvoice(customerId, values);           // a services function
    toast.success(t('saved'));
    onClose();
  } catch (error) {
    toast.error(t('saveFailed'));                     // keep the dialog open and the values intact
  }
});
```

- Use the project's field wrappers (e.g. `Field.Text`, `Field.Select`) instead of wiring `Controller`
  by hand each time.
- **Create vs edit**: one form component; `defaultValues` from a `toFormValues(entity)` mapper or an
  `EMPTY_X` constant. Reset when the edited entity changes (`reset(toFormValues(entity))`).
- Submit button: `loading={isSubmitting}` and disabled while submitting; prevent double submit.
- Server-side validation errors map onto fields with `setError(field, { message })`; anything else
  is a translated toast. Never clear the form on failure.
- Transform values at the edge (`toFormValues` / `toApiInput`), not inside field components.
- Validate on the server too — client validation is for user experience only (`code-quality`, reference/security.md).

## Dialogs

- Open state from a boolean hook (`useBoolean`) or `useState`; the dialog owns the form.
- Close only after the save succeeds.
- Destructive actions (delete, archive, revoke) go through a confirm dialog that names the item.

## Accessibility

Every field has a visible label; errors are shown as helper text tied to the field; the first invalid
field receives focus on submit (react-hook-form does this with `shouldFocusError`, the default).
