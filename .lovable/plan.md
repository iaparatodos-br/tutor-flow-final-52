

# Fix: Aula permanece em "aguardando_pagamento" após fatura paga automaticamente

## Causa Raiz

A function `auto-verify-pending-invoices` atualiza o status da fatura para `paga` quando o Stripe confirma o pagamento, mas **não sincroniza o status da aula vinculada**. A lógica de auto-confirmação de aula (`autoConfirmClassIfAwaiting`) existe apenas na function `cancel-payment-intent` (pagamento manual).

**Dados confirmados no banco:**
- Fatura `27ea3924`: status `paga`, payment_origin `automatic`
- Aula `d76db8dc` (11/03): status `aguardando_pagamento`
- Participante `4dbded5a`: status `aguardando_pagamento`, confirmed_at `null`

## Correção

### 1. Adicionar lógica de auto-confirmação em `auto-verify-pending-invoices`

Após marcar uma fatura como `paga` (linha ~174), adicionar a mesma lógica que `cancel-payment-intent` usa:

```typescript
// Após updatedCount++, quando newStatus === 'paga':
if (newStatus === 'paga' && invoice.class_id) {
  // Auto-confirm class if awaiting payment
  const { data: classData } = await supabaseClient
    .from('classes')
    .select('id, status')
    .eq('id', invoice.class_id)
    .eq('status', 'aguardando_pagamento')
    .maybeSingle();

  if (classData) {
    await supabaseClient
      .from('classes')
      .update({ status: 'confirmada', updated_at: new Date().toISOString() })
      .eq('id', classData.id)
      .eq('status', 'aguardando_pagamento');

    await supabaseClient
      .from('class_participants')
      .update({ status: 'confirmada', confirmed_at: new Date().toISOString() })
      .eq('class_id', classData.id)
      .eq('status', 'aguardando_pagamento');

    logStep('Class auto-confirmed after automatic payment', { classId: classData.id });
  }
}
```

### 2. Mesmo fix em `verify-payment-status`

A function `verify-payment-status` (chamada pelo frontend) tem o mesmo gap — atualiza a fatura mas não a aula. Adicionar a mesma lógica.

### 3. Corrigir dados existentes (fix imediato)

Corrigir a aula e participante do Erik que já estão dessincronizados:

```sql
UPDATE classes SET status = 'confirmada', updated_at = now()
WHERE id = 'd76db8dc-2ebb-4785-8aa7-133b1500b0b6' AND status = 'aguardando_pagamento';

UPDATE class_participants SET status = 'confirmada', confirmed_at = now()
WHERE class_id = 'd76db8dc-2ebb-4785-8aa7-133b1500b0b6' AND status = 'aguardando_pagamento';
```

## Impacto

- **2 edge functions editadas**: `auto-verify-pending-invoices`, `verify-payment-status`
- **1 migração SQL**: corrigir dados dessincronizados do Erik
- **0 arquivos frontend**

