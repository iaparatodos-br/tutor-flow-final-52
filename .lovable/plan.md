
## Bloquear geração de boleto nos fluxos de fatura manual e pagamento pelo aluno

### Problema

A flag `auto_generate_boleto` foi implementada apenas no `automated-billing`. Os dois outros pontos de entrada para geração de boleto continuam ignorando essa configuração:

1. **Fatura manual** (`create-invoice`): Quando o professor cria uma fatura manual, a função gera boleto automaticamente no Stripe sem verificar a flag.
2. **Pagamento pelo aluno** (`generate-boleto-for-invoice`): Quando o aluno clica em "Pagar", a função gera boleto sem verificar a flag.

### Alterações

**1. `supabase/functions/create-invoice/index.ts`**

Na linha ~152, onde o `business_profiles` já é consultado, adicionar `auto_generate_boleto` ao `select`:

```
.select('enabled_payment_methods, auto_generate_boleto')
```

Na linha ~423, antes de determinar o `selectedPaymentMethod`, verificar a flag:

```typescript
// Se professor desativou geração automática de boleto, não gerar pagamento
if (bp?.auto_generate_boleto === false) {
  selectedPaymentMethod = null;
  logStep("Boleto generation disabled by teacher settings");
}
```

Isso fará com que a fatura seja criada normalmente (status "pendente") mas sem boleto vinculado. O aluno verá "Aguardando boleto" na listagem.

**2. `supabase/functions/generate-boleto-for-invoice/index.ts`**

Após buscar a fatura (linha ~54), adicionar consulta ao `business_profiles` do professor para verificar a flag:

```typescript
const { data: businessProfile } = await supabaseClient
  .from('business_profiles')
  .select('auto_generate_boleto')
  .eq('user_id', invoice.teacher_id)
  .maybeSingle();

if (businessProfile?.auto_generate_boleto === false) {
  return Response com erro:
  "A geração automática de boletos está desativada pelo professor. 
   Entre em contato com seu professor para obter os dados de pagamento."
}
```

Isso impede que o aluno force a geração de boleto pelo Stripe quando o professor optou por emiti-los externamente.

### Resultado esperado

- Professor com `auto_generate_boleto = false` cria fatura manual: fatura criada sem boleto
- Aluno vê fatura com mensagem "Aguardando boleto" (sem botão de pagar)
- Caso o aluno tente chamar `generate-boleto-for-invoice` diretamente, recebe erro explicativo
- Professores com a flag ativada (default) continuam com comportamento normal
