

# Revisao do Plano de Cobranca Hibrida v4.1 — Pontas Soltas Adicionais

## Pontas Soltas Ja Identificadas (v4.1)

O plano v4.1 ja documenta 16 pontas soltas. Esta revisao adiciona **7 novas pontas soltas** e **4 melhorias** nao cobertas anteriormente.

---

## Novas Pontas Soltas (17-23)

### 17. Agenda.tsx — materializeVirtualClass no frontend tambem nao propaga is_paid_class

O plano v4.1 cobre a edge function `materialize-virtual-class` (ponta #8), mas ha uma **segunda via de materializacao** no frontend. Em `Agenda.tsx` linhas 1288-1299, o metodo `materializeVirtualClass` cria `realClassData` diretamente via `supabase.from('classes').insert(...)` e **tambem nao inclui `is_paid_class`**. Sao portanto **3 pontos de insercao** que precisam de `is_paid_class`:

1. `handleClassSubmit` (Agenda.tsx, linha 1419) — criacao de aula nova
2. `materializeVirtualClass` frontend (Agenda.tsx, linha 1288) — materializacao via frontend
3. Edge function `materialize-virtual-class` (linha 252) — materializacao via backend

### 18. Agenda.tsx — handleClassSubmit nao busca charge_timing para decidir geracao de fatura

O plano define que a fatura pre-paga deve ser gerada "no submit do ClassForm, apos criar a aula" (Fase 4). Porem o `handleClassSubmit` (linha 1392) nao possui nenhuma logica de:
- Buscar `charge_timing` do `business_profiles`
- Chamar `create-invoice` apos a insercao
- Tratar erro de geracao de fatura (toast destructive conforme memoria `ui-feedback-constraints`)

Isso precisa ser detalhado na Fase 4 com pseudo-codigo, pois e a parte mais complexa da integracao frontend.

### 19. CancellationModal — nao busca is_paid_class na query de dados da aula

A query na linha 113 do `CancellationModal.tsx` busca `teacher_id, class_date, service_id, is_group_class, is_experimental, class_services(price)` mas **nao busca `is_paid_class`**. Sem esse campo, o modal nao consegue exibir o aviso especifico para aulas pre-pagas definido no plano.

Alem disso, o modal **nao busca `charge_timing` do `business_profiles`** do professor, necessario para identificar se a aula e pre-paga ou pos-paga.

### 20. CancellationModal — logica de `willBeCharged` precisa considerar is_paid_class e charge_timing

Atualmente (linha 179), `willBeCharged` e calculado apenas com base em `is_experimental`, `isProfessor`, `hoursUntilClass` e `chargePercentage`. Com o plano v4.1:
- Se `is_paid_class = false`: `willBeCharged` deve ser sempre `false` (igual a experimental)
- Se `charge_timing = 'prepaid'` e `is_paid_class = true`: `willBeCharged` deve ser `false` (cobranca ja feita), mas com mensagem distinta da experimental

### 21. Financeiro.tsx — getInvoiceTypeBadge ja suporta `cancellation` e `orphan_charges`, mas falta `prepaid_class`

O plano v4.1 item #9.2 identifica que `getInvoiceTypeBadge` precisa de novos tipos. Ao verificar o codigo (linha 30-44), descobre-se que `cancellation` e `orphan_charges` **ja estao implementados**. O unico tipo realmente faltante e `prepaid_class`. Isso corrige a ponta #9.2 do plano — o trabalho e menor do que estimado.

Porem o componente `InvoiceTypeBadge.tsx` (o componente compartilhado separado) **so suporta 3 tipos** (`monthly_subscription`, `automated`, `manual`), enquanto `Financeiro.tsx` suporta 5. Ha inconsistencia entre os dois — o plano deve definir qual sera a fonte unica de verdade.

### 22. Duas versoes de BillingSettings competindo

Existem **dois arquivos** com funcionalidades sobrepostas:
- `src/components/Settings/BillingSettings.tsx` — configuracoes do professor (payment_due_days, default_billing_day, payment methods)
- `src/components/BillingSettings.tsx` — configuracoes de cobranca do aluno (guardian info, CPF, endereco)

O plano v4.1 diz "BillingSettings: card de selecao charge_timing" mas nao especifica **qual** dos dois arquivos. O `charge_timing` e uma configuracao do professor no `business_profiles`, portanto deve ir em `src/components/Settings/BillingSettings.tsx`. O plano precisa ser explicito sobre isso.

### 23. create-invoice — autenticacao impede uso server-to-server para pre-pago

A edge function `create-invoice` (linha 41-49) **exige** autenticacao via `getUser(token)`. Quando chamada server-to-server pelo `process-cancellation` (linha 451), usa o `SUPABASE_SERVICE_ROLE_KEY` como token, que **funciona** para service role.

Porem, para a Fase 4 (geracao de fatura pre-paga), a chamada viria do **frontend** (Agenda.tsx). O `create-invoice` ja funciona com token de usuario autenticado, mas o plano deve confirmar que o `create-invoice` aceita `invoice_type = 'prepaid_class'` sem validacao adicional que possa rejeitar esse tipo.

---

## Melhorias Identificadas

### M1. ClassForm nao precisa receber charge_timing via props — buscar diretamente

O plano diz "ClassForm precisa receber `charge_timing` do professor (via props ou query)". Porem, como o ClassForm ja e usado apenas por professores e o `charge_timing` vem de `business_profiles`, a abordagem mais limpa e **buscar dentro do proprio ClassForm** usando uma query `useEffect` ao abrir o dialog, em vez de poluir a interface de props. Isso evita alteracoes em `Agenda.tsx` para passar dados de billing ao ClassForm.

### M2. Ordem das fases pode ser otimizada

A Fase 7 (automated-billing + materialize) deve vir **antes** da Fase 4 (geracao de fatura pre-paga), porque o filtro `is_paid_class` no RPC e a propagacao na materializacao sao pre-requisitos para garantir que o sistema existente nao quebre antes de adicionar a nova funcionalidade pre-paga. Ordem sugerida:

```text
Fase 2: BillingSettings (charge_timing UI)
Fase 3: ClassForm (is_paid_class + bloqueio recorrencia)
Fase 3.5: automated-billing RPC + materialize (filtro is_paid_class) [era Fase 7]
Fase 4: Agenda.tsx (geracao fatura pre-paga)
Fase 5: Cancelamento
Fase 6: AmnestyButton
Fase 7: InvoiceTypeBadge + i18n + testes [era Fase 8]
```

### M3. Teste de regressao do automated-billing deve ser explicito

Apos adicionar `AND c.is_paid_class = true` na RPC, todas as aulas existentes (que tem `is_paid_class = true` por default) devem continuar sendo faturadas normalmente. O plano deve incluir um **cenario de teste de regressao**: executar `automated-billing` para um professor existente e verificar que nenhuma aula e perdida.

### M4. Card informativo precisa de conteudo definido

O plano menciona "card informativo explicando cada modelo" mas nao define o **texto** do card. O conteudo deve ser documentado para que a implementacao i18n seja direta. Sugestao:

- **Pre-pago**: "A fatura e gerada imediatamente ao agendar a aula. Aulas pagas nao podem ser recorrentes. Em caso de cancelamento, nao ha reembolso automatico."
- **Pos-pago**: "As aulas sao acumuladas e cobradas no dia de fechamento do ciclo. Aulas podem ser recorrentes. Em caso de cancelamento tardio, uma taxa pode ser aplicada conforme sua politica."

---

## Resumo Consolidado

| Categoria | Itens v4.1 | Novos Itens | Total |
|-----------|-----------|-------------|-------|
| Pontas soltas | 16 | 7 (#17-#23) | 23 |
| Melhorias | 0 | 4 (M1-M4) | 4 |

### Acoes recomendadas antes de implementar

1. Atualizar `docs/hybrid-billing-implementation-plan.md` com as 7 novas pontas e 4 melhorias
2. Reordenar as fases conforme M2
3. Definir texto do card informativo (M4) para desbloquear i18n
4. Decidir consolidacao `InvoiceTypeBadge` vs `getInvoiceTypeBadge` inline (#21)
5. Explicitar que `charge_timing` vai em `Settings/BillingSettings.tsx` (#22)

