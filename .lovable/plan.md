

# Expansao Financeira do Plano E2E — Novos Cenarios e Checkpoints

## Diagnostico

O plano atual cobre a **geracao** de faturas (automatica, manual, pre-paga), mas nao valida explicitamente:

- Painel Financeiro do professor (cards de resumo, calculo de lucro liquido, taxa Stripe R$ 3,49)
- Fluxo do aluno para pagar fatura (tela Faturas.tsx, botao "Pagar Agora", "Ver Recibo")
- Marcacao manual como paga (cancel-payment-intent + sincronizacao de status)
- Validacoes de boleto (minimo R$ 5,00, maximo R$ 49.999,99)
- Toggle de geracao automatica de boleto (auto_generate_boleto = false)
- Faturas de mensalidade (monthly_subscription billing cycle)
- Gestao de despesas (CRUD no ExpenseList)
- Deep-linking de faturas via Inbox
- Visualizacao de faturas de dependentes pelo responsavel (tela do aluno)
- Deteccao e exibicao de faturas vencidas (overdue)
- StripeAccountGuard bloqueando acoes quando conta restrita

## Plano de Alteracoes

### 1. Nova Categoria 7: Modulo Financeiro Detalhado

Adicionar **16 novos cenarios** (#85 a #100) focados exclusivamente na experiencia financeira:

| #   | Codigo                | Descricao                                                                          |
|-----|----------------------|------------------------------------------------------------------------------------|
| 85  | Fin+Dashboard        | Cards de resumo: Receitas Pendentes, Recebidas, Despesas, Lucro Liquido corretos   |
| 86  | Fin+TaxaStripe       | Alerta de transparencia de taxa R$ 3,49. Calculo de exemplo visivel                |
| 87  | Fin+MarkPaid         | Marcar fatura pendente como paga manualmente. Status muda, PI cancelado no Stripe  |
| 88  | Fin+MarkPaid+Sync    | Aula pre-paga marcada como paga manualmente sincroniza status para "confirmada"    |
| 89  | Fin+BoletoMin        | Criar fatura manual com valor < R$ 5,00. Sistema bloqueia com erro                 |
| 90  | Fin+BoletoMax        | Criar fatura manual com valor > R$ 49.999,99. Sistema bloqueia com erro            |
| 91  | Fin+AutoBoletoOff    | Desativar auto_generate_boleto. Fatura criada mas sem boleto gerado no Stripe      |
| 92  | Fin+Despesa          | Adicionar despesa no mes. Card "Total Despesas" atualiza. Lucro liquido recalcula  |
| 93  | Fin+Mensalidade      | Faturamento automatico de mensalidade: valor integral cobrado no billing_day       |
| 94  | Fin+MensalidadeDep   | Mensalidade com dependentes: fatura consolidada no responsavel com nome do filho   |
| 95  | Fin+AlunoFaturas     | Aluno visualiza faturas na tela Faturas.tsx. Botao "Pagar Agora" abre boleto_url   |
| 96  | Fin+AlunoRecibo      | Aluno clica "Ver Recibo" em fatura paga. Pagina /recibo exibe dados corretos       |
| 97  | Fin+AlunoDepFaturas  | Responsavel ve faturas dos dependentes com badge "Dependente" na tela do aluno     |
| 98  | Fin+Vencida          | Fatura pendente passa da data de vencimento. Badge muda para "Vencida" na UI       |
| 99  | Fin+DeepLink         | Notificacao no Inbox com link para fatura. Clique navega e destaca a fatura        |
| 100 | Fin+ContaRestrita    | StripeAccountGuard: conta restrita bloqueia criacao de faturas com alerta visivel   |

### 2. Tres Novos Roteiros (17, 18, 19)

**Roteiro 17 — Painel Financeiro do Professor (8 cenarios)**
Cobre: #85, #86, #87, #88, #89, #90, #91, #92

Fluxo: Abrir Financeiro -> verificar cards de resumo -> ver alerta de taxa Stripe -> criar fatura < R$5 (bloqueio) -> criar fatura > R$49.999 (bloqueio) -> criar fatura valida -> marcar como paga manualmente -> verificar PI cancelado -> verificar sincronizacao de aula pre-paga -> desativar auto_generate_boleto -> gerar fatura (sem boleto) -> adicionar despesa -> conferir lucro liquido.

**Roteiro 18 — Mensalidades e Faturamento Ciclico (2 cenarios)**
Cobre: #93, #94

Fluxo: Configurar mensalidade com billing_day -> vincular aluno e dependente -> aguardar/executar ciclo -> verificar fatura integral no valor base -> verificar fatura do dependente consolidada no responsavel com descricao "[Nome] - Aula".

**Roteiro 19 — Experiencia Financeira do Aluno (5 cenarios)**
Cobre: #95, #96, #97, #98, #99, #100

Fluxo: Logar como aluno -> abrir Faturas -> ver lista com faturas proprias e de dependentes (badge) -> clicar "Pagar Agora" em fatura pendente com boleto -> verificar fatura vencida com badge vermelha -> clicar "Ver Recibo" em fatura paga -> verificar dados do recibo -> testar deep-link vindo do Inbox -> logar como professor com conta restrita -> verificar StripeAccountGuard bloqueia acoes.

### 3. Checkpoints Financeiros em Roteiros Existentes

Adicionar linhas de validacao financeira nos roteiros ja existentes:

- **Roteiro 02** (Cancelamentos): Apos passo 6 (fatura manual), adicionar checkpoint: "Verificar que a fatura aparece no painel Financeiro com tipo 'Manual' e valor correto"
- **Roteiro 06** (Fatura Manual): Apos passo 4, checkpoint: "Aluno ve a fatura na tela Faturas.tsx com botao 'Pagar Agora'"
- **Roteiro 07** (Faturamento Auto): Apos passo 1, checkpoint: "Fatura aparece no painel com tipo 'Automatica'. Card Receitas Pendentes atualiza"
- **Roteiro 09** (Dependentes): Apos passo 7, checkpoint: "Responsavel ve fatura com badge 'Dependente' na tela do aluno"

### 4. Atualizacao da Tabela de Referencia Cruzada

Adicionar roteiros 17-19 com totais atualizados (84 + 16 = **100 cenarios** em **19 roteiros**).

### 5. Arquivos Envolvidos (novos)

Adicionar a tabela de arquivos:
- `src/pages/Financeiro.tsx` — Painel financeiro do professor
- `src/pages/Faturas.tsx` — Tela de faturas do aluno
- `src/components/ExpenseList.tsx` / `ExpenseModal.tsx` — Gestao de despesas
- `src/components/InvoiceStatusBadge.tsx` / `InvoiceTypeBadge.tsx` — Badges de status/tipo
- `src/components/StripeAccountGuard.tsx` — Guard de conta restrita
- `src/components/PaymentOptionsCard.tsx` — Opcoes de pagamento
- `src/utils/stripe-fees.ts` — Validacao de valores boleto e calculo de taxas
- `supabase/functions/cancel-payment-intent/index.ts` — Marcacao manual como paga
- `supabase/functions/validate-monthly-subscriptions/index.ts` — Validacao de mensalidades

### Resumo da Alteracao no Arquivo

O documento `docs/e2e-test-plan-classes.md` sera atualizado com:

1. Nova **Categoria 7: Modulo Financeiro** com 16 cenarios (#85-#100)
2. Tres novos **Roteiros 17, 18 e 19** com passo a passo detalhado
3. **Checkpoints financeiros** adicionados como sub-passos nos Roteiros 02, 06, 07 e 09
4. **Tabela de referencia cruzada** expandida (19 roteiros, 100 cenarios)
5. **Tabela de arquivos** expandida com 9 novos componentes financeiros
6. Atualizar o cabecalho do documento de "84 fluxos" para "100 fluxos"
