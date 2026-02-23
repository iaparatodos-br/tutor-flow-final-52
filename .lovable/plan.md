

## Remover Limite de Aulas e Excedentes das Mensalidades

### Contexto
Com o novo modelo de negocios, as mensalidades passam a ter valor fixo mensal sem controle de franquia de aulas. Os campos `max_classes`, `overage_price` e toda a logica de excedentes (overage) se tornam obsoletos.

### Escopo da Remocao

A remocao abrange **13+ arquivos** em 4 camadas: banco de dados, edge functions, tipos/schemas e frontend.

---

### 1. Banco de Dados (Migration SQL)

Remover colunas da tabela `monthly_subscriptions`:
- `max_classes` (INTEGER, nullable)
- `overage_price` (NUMERIC, nullable)

Atualizar as 3 RPCs que retornam esses campos:
- `get_student_active_subscription` -- remover `max_classes` e `overage_price` do RETURNS TABLE e do SELECT
- `get_student_subscription_details` -- idem
- `get_subscriptions_with_students` -- idem

**IMPORTANTE**: Verificar dados em Live antes de dropar colunas. Se houver mensalidades ativas com `max_classes` preenchido, o professor deve ser avisado que a logica de limite sera removida.

---

### 2. Edge Functions (4 arquivos)

**`supabase/functions/automated-billing/index.ts`**:
- Remover interface `ActiveSubscription.max_classes` e `overage_price`
- Remover todo o bloco de calculo de excedentes (linhas 798-829): "Item 2: Calcular excedentes"
- Remover logs de overage e referencias a `maxClasses`/`overagePrice`
- Simplificar descricao da fatura (remover `(X/Y aulas)` e `+ N excedentes`)

**`supabase/functions/send-invoice-notification/index.ts`**:
- Remover interface `MonthlySubscriptionDetails.max_classes` e `overage_price`
- Remover select de `max_classes, overage_price` na query
- Remover `monthlySubscriptionInfo.maxClasses`, `overageCount`, `overageTotal`
- Remover secao condicional do HTML de email que exibe limite e excedentes (linhas 343-356)
- Simplificar para exibir apenas "Aulas: Ilimitadas"

**`supabase/functions/validate-monthly-subscriptions/index.ts`**:
- Remover validacao V02 (Regra Limite/Excedente) inteira -- nao faz mais sentido
- Ajustar contadores de validacao

**`supabase/functions/dev-seed-test-data/index.ts`** (se referencia max_classes):
- Remover campos dos dados de seed

---

### 3. Tipos e Schemas (3 arquivos)

**`src/types/monthly-subscriptions.ts`**:
- Remover `max_classes` e `overage_price` de `MonthlySubscription`, `MonthlySubscriptionWithCount`, `StudentSubscriptionDetails`, `ActiveSubscription`
- Remover `hasLimit`, `maxClasses`, `overagePrice` de `MonthlySubscriptionFormData`

**`src/schemas/monthly-subscription.schema.ts`**:
- Remover campos `hasLimit`, `maxClasses`, `overagePrice` do schema Zod
- Remover os dois `.refine()` que validam limite/excedente
- Remover o `.transform()` que limpa maxClasses/overagePrice quando hasLimit=false

---

### 4. Frontend (5 arquivos)

**`src/components/MonthlySubscriptionModal.tsx`**:
- Remover campos do formulario: toggle "hasLimit", input "maxClasses", input "overagePrice"
- Remover `const hasLimit = form.watch("hasLimit")`
- Remover imports de `Switch`
- Remover defaultValues de hasLimit/maxClasses/overagePrice

**`src/components/MonthlySubscriptionCard.tsx`**:
- Remover secao "Class Limit" (linhas 71-85) -- sempre sera ilimitado, nao precisa exibir
- Remover secao "Overage Price" (linhas 87-96)
- Remover import de `Infinity`

**`src/hooks/useMonthlySubscriptions.ts`**:
- Em `useCreateMonthlySubscription`: remover `max_classes` e `overage_price` do insert
- Em `useUpdateMonthlySubscription`: remover logica `hasLimit` e mapeamento de max_classes/overage_price

**`src/pages/StudentDashboard.tsx`**:
- Remover `max_classes` do tipo do estado e da query
- Remover bloco condicional de progresso de aulas (linhas 945-958) -- sempre mostrar "Aulas ilimitadas"
- Remover calculo de `progressValue`
- Remover import de `Progress`

**`src/pages/DevValidation.tsx`**:
- Remover ou simplificar a validacao que busca `max_classes`/`overage_price`

---

### 5. Internacionalizacao (2 arquivos x 2 idiomas = 4 arquivos)

Remover chaves de i18n que nao serao mais usadas em `monthlySubscriptions.json` (pt e en):
- `fields.hasLimit`, `fields.maxClasses`, `fields.maxClassesPlaceholder`, `fields.overagePrice`, `fields.overagePricePlaceholder`
- `list.unlimited`, `list.classesLimit`, `list.overage`, `list.noOverage`, `list.classesUsed`, `list.classesUsedUnlimited`
- `validation.validMaxClasses`, `validation.validOveragePrice`
- `info.ignoreCancellations`, `info.overageExplanation`
- `studentView.classesRemaining`, `studentView.unlimitedClasses`

---

### 6. Documentacao

Atualizar `docs/validation-queries.sql`:
- Remover queries V02, V05, V06 que referenciam max_classes/overage_price

---

### Ordem de Execucao

1. Migration SQL (dropar colunas + atualizar RPCs)
2. Edge Functions (remover logica de overage)
3. Tipos e Schemas
4. Frontend (formulario, card, dashboard)
5. i18n (limpar chaves)
6. Deploy edge functions

### Riscos e Mitigacoes

- **Dados existentes**: Antes da migration, verificar se ha mensalidades com `max_classes IS NOT NULL` em producao. Se houver, os valores serao perdidos -- o professor precisa estar ciente.
- **Faturas historicas**: Faturas ja geradas com itens `item_type = 'overage'` permanecerao intactas no historico (nao sao afetadas).
- **RPCs**: As RPCs serao recriadas sem os campos, mas o `types.ts` sera regenerado automaticamente apos a migration.

