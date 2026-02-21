
## Fix: Add Missing "Create Invoice" Button to CreateInvoiceModal

### Problem
The `CreateInvoiceModal` component has an empty `<DialogTrigger asChild>` with no button child. This means the modal cannot be opened from either the Financeiro or Alunos pages, completely blocking manual invoice creation for teachers.

### Root Cause
The button was either accidentally removed or never added inside the `<DialogTrigger>` component (line ~147 of `CreateInvoiceModal.tsx`).

### Solution

**File: `src/components/CreateInvoiceModal.tsx`**

Add a button inside the `<DialogTrigger>` that matches the existing design system:

```tsx
<DialogTrigger asChild>
  <Button className="bg-gradient-primary shadow-primary hover:bg-primary-hover">
    <DollarSign className="h-4 w-4 mr-2" />
    {t('actions.newInvoice') || 'Nova Fatura'}
  </Button>
</DialogTrigger>
```

The `DollarSign` icon is already imported. The translation key `actions.newInvoice` already exists in the `financial` namespace (EN: "New Invoice").

### Changes Required
1. **`src/components/CreateInvoiceModal.tsx`** - Add the `<Button>` inside `<DialogTrigger>` (1 line change)

### No other files need modification
- The translation keys already exist in both `en/financial.json` ("New Invoice") and `pt/financial.json` (needs adding "Nova Fatura")
- The component is already imported and rendered correctly in both `Financeiro.tsx` and `Alunos.tsx`

### After the fix
- The "Nova Fatura" button will appear on the Financeiro page next to the "Faturas Emitidas" header
- The button will also appear on the Alunos page in the action buttons area
- Teachers can create manual invoices, which will auto-generate boleto/PIX and send notifications
