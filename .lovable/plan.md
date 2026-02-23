

## Atualizar status da aula ao confirmar pagamento manual

### Problema
Quando o professor marca manualmente uma fatura como paga (via "Marcar como Paga" no Financeiro), a edge function `cancel-payment-intent` atualiza apenas o status da fatura para `paga`, mas **nao atualiza o status da aula** associada de `aguardando_pagamento` para `confirmada`.

O webhook do Stripe (`webhook-stripe-connect`) ja faz essa transicao automaticamente quando o pagamento e confirmado via Stripe. Porem, o fluxo manual nao replica essa logica.

### Solucao
Adicionar logica na edge function `cancel-payment-intent` para, apos marcar a fatura como paga, verificar se existe uma aula vinculada (`class_id`) com status `aguardando_pagamento` e atualiza-la para `confirmada`, incluindo os participantes.

### Arquivo a alterar

**`supabase/functions/cancel-payment-intent/index.ts`**

Apos cada bloco de UPDATE da fatura (existem dois: um sem payment intent na linha ~108 e outro com na linha ~169), adicionar a seguinte logica:

```typescript
// Auto-confirm class if prepaid and awaiting payment
const { data: invoiceWithClass } = await supabase
  .from('invoices')
  .select('class_id')
  .eq('id', invoice_id)
  .maybeSingle();

if (invoiceWithClass?.class_id) {
  const { data: classData } = await supabase
    .from('classes')
    .select('id, status')
    .eq('id', invoiceWithClass.class_id)
    .eq('status', 'aguardando_pagamento')
    .maybeSingle();

  if (classData) {
    await supabase
      .from('classes')
      .update({ status: 'confirmada', updated_at: new Date().toISOString() })
      .eq('id', classData.id)
      .eq('status', 'aguardando_pagamento');

    await supabase
      .from('class_participants')
      .update({ status: 'confirmada', confirmed_at: new Date().toISOString() })
      .eq('class_id', classData.id)
      .eq('status', 'aguardando_pagamento');

    logStep('Class auto-confirmed after manual payment', { classId: classData.id });
  }
}
```

A logica segue exatamente o mesmo padrao ja usado no `webhook-stripe-connect` (linhas 375-395 e 646-664), garantindo consistencia:
- Busca sequencial (sem JOINs, conforme constraint do projeto)
- Guard clause com `.eq('status', 'aguardando_pagamento')` para evitar sobrescrever status terminais
- Atualiza tanto `classes` quanto `class_participants`

### Impacto
- Nenhuma alteracao no frontend
- Nenhuma alteracao no banco de dados
- A logica sera executada de forma nao-destrutiva (so atualiza se o status for `aguardando_pagamento`)
