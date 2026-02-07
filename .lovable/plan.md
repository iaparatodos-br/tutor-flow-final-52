
# Atualizar documento com correcoes dos 11 gaps identificados

## Resumo

Atualizar o arquivo `docs/hybrid-billing-implementation-plan.md` (versao 1.1 para 1.2) incorporando as correcoes para os 11 gaps tecnicos identificados na revisao. O documento atual tem 983 linhas e requer ajustes em multiplas secoes.

## Gaps a Incorporar

### Gap 1: `getInvoiceTypeBadge` duplicado em `Financeiro.tsx`

**Problema**: `Financeiro.tsx` tem uma funcao inline `getInvoiceTypeBadge` (linhas 30-45) que usa `Badge` nativo com `variant` e NAO inclui os tipos `prepaid_class` nem `orphan_charges` de forma consistente. O componente compartilhado `InvoiceTypeBadge.tsx` usa icones e cores customizadas. Quando adicionarmos `prepaid_class` ao `InvoiceTypeBadge.tsx`, o `Financeiro.tsx` continuara usando sua versao desatualizada.

**Correcao no documento**: Adicionar `Financeiro.tsx` na tabela de arquivos a modificar (Fase 2), com a acao de substituir `getInvoiceTypeBadge` inline pelo componente `InvoiceTypeBadge` importado. Documentar as linhas exatas (30-45 e usos nas linhas 581, 716).

### Gap 2: `stripe_hosted_invoice_url` / `hosted_invoice_url`

**Problema**: O plano descreve criar Stripe Invoices via `stripe.invoices.create` + `finalizeInvoice`, mas nao menciona salvar o `hosted_invoice_url` retornado pelo Stripe. A tabela `invoices` ja possui a coluna `stripe_hosted_invoice_url` (e tambem `stripe_invoice_url`). A pagina `Faturas.tsx` usa `stripe_hosted_invoice_url` para o botao "Pagar Agora" (linha 131). Sem salvar esse campo, o aluno nao conseguira pagar a fatura pre-paga.

**Correcao no documento**: Na secao 5.1 (process-class-billing), adicionar explicitamente no passo vi:
- Salvar `stripe_hosted_invoice_url: stripeInvoice.hosted_invoice_url`
- Salvar `stripe_invoice_url: stripeInvoice.invoice_pdf`

### Gap 3: Import do Stripe no `process-cancellation`

**Problema**: A secao 5.4 descreve adicionar logica de `stripe.invoices.voidInvoice` no `process-cancellation`, mas o arquivo atual (linha 1-2) so importa `serve` e `createClient`. Nao importa o SDK do Stripe. O codigo proposto usa `new Stripe(...)` sem o import correspondente.

**Correcao no documento**: Na secao 5.4, adicionar explicitamente que o import `import Stripe from "https://esm.sh/stripe@14.21.0"` deve ser adicionado no topo do arquivo `process-cancellation/index.ts`.

### Gap 4: `payment_due_days` no `process-class-billing`

**Problema**: O plano menciona `days_until_due: paymentDueDays` na criacao da Invoice Stripe, mas nao especifica de onde buscar esse valor. O campo `payment_due_days` esta na tabela `profiles` (nao em `business_profiles`). A query atual do plano so busca `business_profiles`.

**Correcao no documento**: Na secao 5.1, adicionar um passo explicito para buscar `payment_due_days` de `profiles` (tabela do professor) apos buscar `business_profiles`. Exemplo: `SELECT payment_due_days FROM profiles WHERE id = teacher_id`.

### Gap 5: Tratamento de dependentes no `process-class-billing`

**Problema**: O plano menciona "agrupar participantes por student_id (responsavel)" e "Se participante tem dependent_id, buscar responsible_id", mas nao detalha como a descricao do Invoice Item deve incluir o nome do dependente (padrao existente: `[NomeDependente] - Aula de Musica`). Tambem nao detalha como o `dependent_id` sera salvo no `invoice_classes`.

**Correcao no documento**: Na secao 5.1 passo 3c.iii, especificar que:
- Se o participante tem `dependent_id`, buscar o nome do dependente na tabela `dependents`
- A descricao do Invoice Item deve seguir o padrao `[NomeDependente] - Aula de {serviceName} - {classDate}`
- O `invoice_classes` deve salvar `dependent_id` alem de `participant_id`

### Gap 6: Validacao de `stripe_connect_id` e `charges_enabled`

**Problema**: O plano verifica se o professor tem `business_profile`, mas nao valida se `stripe_connect_id` existe e se `charges_enabled = true` no Stripe antes de tentar criar Invoice Items. Se o professor criou o perfil de negocios mas nao completou o onboarding do Stripe, a operacao falhara.

**Correcao no documento**: Na secao 5.1, adicionar validacao antes do passo 3:
- Verificar que `business_profile.stripe_connect_id` nao e null
- Buscar `payment_accounts` ou `stripe_connect_accounts` para verificar `stripe_charges_enabled = true`
- Se nao estiver habilitado, retornar `{ charge_timing: 'stripe_not_ready' }` silenciosamente

### Gap 7: Join `invoices!inner` pode falhar por RLS no `CancellationModal`

**Problema**: A funcao `checkPrepaidBilling` proposta no `CancellationModal.tsx` usa `.select('invoices!inner(...)').eq('invoices.invoice_type', 'prepaid_class')`. Se o usuario logado for aluno, as politicas RLS da tabela `invoices` podem bloquear o acesso. Alem disso, joins aninhados com `!inner` e filtros podem ter comportamento inesperado no PostgREST.

**Correcao no documento**: Na secao 4.3, mover a verificacao de fatura pre-paga para DENTRO da edge function `process-cancellation` (que usa `SUPABASE_SERVICE_ROLE_KEY` e ignora RLS). Simplificar o `CancellationModal.tsx` para apenas passar informacao de que e uma aula que pode ter fatura, e deixar o backend decidir.

### Gap 8: Indicador visual na Agenda para aulas com fatura emitida

**Problema**: O plano menciona bloquear edicao de aulas com fatura emitida (secao 7.3), mas nao especifica nenhum indicador visual na agenda (calendario) para que o professor identifique quais aulas ja tem fatura. Sem isso, o professor nao saberia visualmente quais aulas sao pre-pagas antes de tentar editar.

**Correcao no documento**: Na secao 4.2 ou nova subsecao, adicionar que:
- Ao carregar aulas no calendario, buscar se a aula tem `invoice_classes` com `invoice_type = 'prepaid_class'`
- Exibir um icone discreto (ex: `Receipt` do lucide-react) no card da aula no calendario
- Ao abrir detalhes, mostrar badge "Fatura emitida" se aplicavel

### Gap 9: Participante adicionado a aula em grupo apos criacao

**Problema**: Quando um participante e adicionado a uma aula em grupo que ja foi criada e faturada (prepaid), nao ha trigger para gerar cobranca para o novo participante. O `process-class-billing` so e chamado no `handleClassSubmit` (criacao).

**Correcao no documento**: Documentar como edge case. Ao adicionar participante a aula existente:
- Se a aula tem fatura prepaid: bloquear adicao de novos participantes (exibir alerta)
- Alternativa: Permitir, mas o professor devera cobrar manualmente via modulo financeiro
- NAO gerar fatura automatica para o novo participante

### Gap 10: `handleCompleteClass` para aulas nao-virtuais

**Problema**: O `handleCompleteClass` (linha 1537-1581) atualiza o status de aulas para `concluida`, mas nao chama `process-class-billing`. Se o professor configurou `prepaid`, a cobranca so ocorre em `handleClassSubmit` (criacao) ou `materializeVirtualClass` (materializacao). Para aulas normais que sao criadas e depois concluidas, a cobranca ja ocorreu na criacao (correto). Mas para aulas criadas antes da feature (sem `invoice_classes`), a conclusao nao gera cobranca retroativa.

**Correcao no documento**: Documentar que `handleCompleteClass` NAO precisa chamar `process-class-billing` porque:
- Aulas normais: billing ocorre na criacao
- Aulas virtuais: billing ocorre na materializacao (que `handleCompleteClass` chama internamente)
- Aulas antigas (pre-feature): serao cobradas pelo `automated-billing` normalmente

### Gap 11: `Financeiro.tsx` nao importa `InvoiceTypeBadge`

**Problema**: Relacionado ao Gap 1 - alem de remover a funcao duplicada, `Financeiro.tsx` precisa importar o componente `InvoiceTypeBadge` e ajustar as chamadas de `getInvoiceTypeBadge(invoice.invoice_type, t)` para `<InvoiceTypeBadge invoiceType={invoice.invoice_type} />`.

**Correcao**: Ja coberto pelo Gap 1.

## Detalhamento Tecnico das Alteracoes no Documento

### Secao 4.3 (CancellationModal) - Simplificar

Remover a funcao `checkPrepaidBilling` do frontend. Toda a verificacao sera feita no backend (`process-cancellation`). O `CancellationModal.tsx` nao precisa de alteracao significativa alem de manter o fluxo atual.

### Secao 5.1 (process-class-billing) - Adicionar detalhes

1. Buscar `payment_due_days` de `profiles` (passo 2, apos buscar `business_profiles`)
2. Validar `stripe_connect_id` e `charges_enabled` (passo 2.5)
3. Detalhar tratamento de dependentes com nomes na descricao (passo 3c.iii)
4. Salvar `stripe_hosted_invoice_url` e `stripe_invoice_url` (passo 3c.vi)
5. Salvar `dependent_id` no `invoice_classes` (passo 3c.vii)

### Secao 5.4 (process-cancellation) - Adicionar import

Adicionar `import Stripe from "https://esm.sh/stripe@14.21.0"` como alteracao explicita.

### Nova subsecao (Agenda visual) - Icone de fatura

Documentar indicador visual para aulas pre-pagas no calendario.

### Tabela de Arquivos - Adicionar Financeiro.tsx

Adicionar `src/pages/Financeiro.tsx` na Fase 2 para refatorar `getInvoiceTypeBadge`.

### Apendice A - Adicionar gaps 15-25

Adicionar novos gaps resolvidos na versao 1.2.

## Alteracoes a Realizar

Atualizar o arquivo `docs/hybrid-billing-implementation-plan.md` com todas as correcoes acima, incrementando a versao para 1.2.
