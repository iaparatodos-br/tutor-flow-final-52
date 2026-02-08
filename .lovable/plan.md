

# Revisao Final: Plano v3.9 FINAL -- 3 Gaps Remanescentes (226-228)

## Resumo

Apos revisao exaustiva cruzando o documento de implementacao (2917 linhas) com os arquivos reais do codebase, encontrei **3 gaps nao cobertos** que impactam diretamente a implementacao das Fases 2 e 7.

Todos os 225 gaps anteriores estao corretamente documentados e consistentes com o codigo real. Os 3 novos gaps sao dependencias tecnicas que causariam erros ou comportamento incorreto se nao tratados.

---

## Gaps Identificados

### Gap 226 -- Financeiro.tsx loadInvoices nao inclui payment_method (Gravidade: Media)

**Problema**: O calculo de fee breakdown documentado no Gap 224 depende de `invoice.payment_method` para diferenciar taxas:
- Boleto: R$ 3,49 fixo
- PIX: 1,19%
- Cartao: 3,2% + R$ 0,39
- Manual/null: R$ 0,00

Porem, a query `loadInvoices` em `Financeiro.tsx` (linhas 243-261) NAO inclui `payment_method` no SELECT:

```sql
-- SELECT atual (linhas 243-261):
id, amount, due_date, status, description, invoice_type, class_id,
original_amount, boleto_url, linha_digitavel, pix_qr_code, pix_copy_paste,
stripe_payment_intent_id, profiles!invoices_student_id_fkey(name, email)
-- FALTA: payment_method
```

A interface `InvoiceWithStudent` (linhas 46-74) tambem nao inclui `payment_method`.

Alem disso, o calculo atual do `stripeFees` (linha 398) e hardcoded:
```typescript
const stripeFees = paidInvoices.length * 3.49; // Incorreto para PIX/Cartao
```

**Resolucao**:
1. Adicionar `payment_method` ao SELECT da query `loadInvoices`
2. Adicionar `payment_method?: string` a interface `InvoiceWithStudent`
3. Substituir calculo fixo (linha 398) pelo calculo variavel por metodo conforme Gap 224

**Fase**: 2 (Frontend - Financeiro refactor)

---

### Gap 227 -- Financeiro.tsx getStatusBadge inline deve usar InvoiceStatusBadge (Gravidade: Media)

**Problema**: O Gap 223 corretamente identifica que `getInvoiceTypeBadge` (linhas 30-45) deve ser substituido pelo componente `InvoiceTypeBadge`. Porem, o plano NAO menciona que `getStatusBadge` (linhas 346-385) tambem deve ser substituido pelo componente `InvoiceStatusBadge`.

Inconsistencias da funcao inline:

1. **Status `falha_pagamento` nao tratado**: A funcao (linhas 346-385) mapeia `pendente`, `open`, `paga`, `paid`, `vencida`, `overdue`, `cancelada`, `void`. O status `falha_pagamento` cai no fallback (`statusConfig.pendente`), exibindo "Pendente" para faturas com falha de pagamento -- informacao incorreta e confusa para o professor.

2. **Nao exibe paymentOrigin**: O componente `InvoiceStatusBadge` mostra sufixo "(Manual)", "(Automatico)" e "(Pre-paga)" para faturas pagas. A funcao inline nao tem essa capacidade.

3. **Inconsistencia visual**: `Faturas.tsx` (visao do aluno, linha 348-351) ja usa `InvoiceStatusBadge` com badges estilizados e icones. `Financeiro.tsx` (visao do professor) usa badges basicos sem icones nem cores semanticas.

**Resolucao**:
1. Importar `InvoiceStatusBadge` em `Financeiro.tsx`
2. Adicionar `payment_origin` ao SELECT da query (complementa Gap 226)
3. Adicionar `payment_origin?: string` a interface `InvoiceWithStudent`
4. Substituir chamadas de `getStatusBadge(invoice.status)` (linhas 584, 719) por `<InvoiceStatusBadge status={invoice.status} paymentOrigin={invoice.payment_origin} />`
5. Remover funcao inline `getStatusBadge` (linhas 346-385)

**Fase**: 2 (Frontend - Financeiro refactor)

---

### Gap 228 -- RPC create_invoice_and_mark_classes_billed: Falta SQL concreto de correcao (Gravidade: Alta)

**Problema**: O Gap 218 corretamente identifica que a RPC atual (migracao `20251030141339`) NAO inclui `payment_origin` nem `original_amount` no INSERT:

```sql
-- INSERT atual (linhas 20-41 da migracao):
INSERT INTO public.invoices (
  student_id, teacher_id, amount, description,
  due_date, status, invoice_type, business_profile_id,
  created_at, updated_at
) VALUES (...)
-- FALTAM: payment_origin, original_amount
```

O plano documenta uma "verificacao obrigatoria" mas NAO fornece o SQL concreto (CREATE OR REPLACE FUNCTION) para corrigir. Sem esse code block, o implementador deve deduzir quais colunas adicionar ao INSERT e como extrai-las do `p_invoice_data` JSONB.

**Resolucao**: Fornecer code block SQL explicito na secao de Fase 7:

```sql
-- Migração: Adicionar payment_origin e original_amount à RPC
CREATE OR REPLACE FUNCTION public.create_invoice_and_mark_classes_billed(
  p_invoice_data jsonb,
  p_class_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id uuid;
  v_result jsonb;
  v_item jsonb;
  v_class_ids uuid[];
  v_participant_ids uuid[];
BEGIN
  INSERT INTO public.invoices (
    student_id, teacher_id, amount, description,
    due_date, status, invoice_type, business_profile_id,
    payment_origin, original_amount,  -- NOVOS CAMPOS
    created_at, updated_at
  ) VALUES (
    (p_invoice_data->>'student_id')::uuid,
    (p_invoice_data->>'teacher_id')::uuid,
    (p_invoice_data->>'amount')::numeric,
    p_invoice_data->>'description',
    (p_invoice_data->>'due_date')::date,
    p_invoice_data->>'status',
    p_invoice_data->>'invoice_type',
    (p_invoice_data->>'business_profile_id')::uuid,
    p_invoice_data->>'payment_origin',           -- NOVO
    (p_invoice_data->>'original_amount')::numeric, -- NOVO (nullable)
    NOW(), NOW()
  ) RETURNING id INTO v_invoice_id;

  -- Restante da funcao permanece identico (loop invoice_classes)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_class_items)
  LOOP
    INSERT INTO public.invoice_classes (
      invoice_id, class_id, participant_id, item_type,
      amount, description, cancellation_policy_id, charge_percentage
    ) VALUES (
      v_invoice_id,
      (v_item->>'class_id')::uuid,
      (v_item->>'participant_id')::uuid,
      v_item->>'item_type',
      (v_item->>'amount')::numeric,
      v_item->>'description',
      (v_item->>'cancellation_policy_id')::uuid,
      (v_item->>'charge_percentage')::numeric
    );
    v_class_ids := array_append(v_class_ids, (v_item->>'class_id')::uuid);
    v_participant_ids := array_append(v_participant_ids, (v_item->>'participant_id')::uuid);
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'items_created', jsonb_array_length(p_class_items),
    'classes_affected', array_length(v_class_ids, 1),
    'participants_affected', array_length(v_participant_ids, 1)
  );
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false, 'error', SQLERRM, 'error_code', SQLSTATE
    );
END;
$$;
```

**Fase**: 7 (Ajustes - automated-billing), execucao ANTES de Gaps 209/212

---

## Atualizacao do Sumario de Fases

| Fase | Impacto dos Novos Gaps |
|------|----------------------|
| Fase 2 | +Gap 226 (loadInvoices SELECT + interface), +Gap 227 (getStatusBadge -> InvoiceStatusBadge) |
| Fase 7 | +Gap 228 (SQL concreto para RPC -- prerequisito para Gaps 209/212) |

## Tabela Consolidada

| # | Gap | Gravidade | Fase | Resolucao |
|---|-----|-----------|------|-----------|
| 226 | Financeiro.tsx loadInvoices nao inclui payment_method | Media | 2 | Adicionar payment_method ao SELECT e a interface; habilitar fee breakdown variavel |
| 227 | Financeiro.tsx getStatusBadge inline nao usa InvoiceStatusBadge | Media | 2 | Substituir por componente compartilhado; adicionar payment_origin ao SELECT e interface |
| 228 | RPC create_invoice_and_mark_classes_billed sem SQL concreto de correcao | Alta | 7 | Fornecer CREATE OR REPLACE FUNCTION com payment_origin e original_amount no INSERT |

## Proximo Passo

Atualizar o documento para **v3.10 FINAL** incorporando os 3 gaps (226-228) e marcar como encerrado para iniciar a Fase 0.

