

# Expansao do Plano de Testes E2E com Cenarios do Gemini

## Resumo

Apos cruzar os 80 cenarios do Gemini com os 52 cenarios atuais do documento `docs/e2e-test-plan-classes.md`, identifiquei **28 cenarios novos** que fazem sentido adicionar. Alguns cenarios do Gemini nao se aplicam (como "professor substituto", que nao existe no sistema) ou ja estao cobertos com nomes diferentes.

O documento sera expandido de 52 para 80 cenarios, organizados em 6 categorias tematicas (ao inves de apenas 3 niveis de prioridade), seguindo a estrutura sugerida pelo Gemini que e mais clara para navegacao.

---

## Cenarios Novos a Adicionar

### Categoria: Stripe e Financeiro (nova secao)
Cenarios que envolvem integracao real com Stripe e fluxo de dinheiro, atualmente ausentes:

- Checkout pre-pago via Stripe redirect (cartao de teste)
- Cancelamento de aula pre-paga com refund no Stripe
- Anistia de pre-paga acionando refund via Edge Function
- Faturamento automatico de grupo (fatura proporcional por participante)
- Fatura manual com geracao de boleto/link
- Cartao recusado (webhook `payment_failed`) exibindo modal de falha
- Aluno inadimplente bloqueado de agendar (`StudentSelectionBlocker`)
- Processar taxas orfas (`process-orphan-cancellation-charges`)
- Onboarding Stripe Connect (fluxo KYC do tutor)
- Upgrade/Downgrade de plano do professor
- Expiracao de assinatura e restricao via `FinancialRouteGuard`
- Overage de alunos (`handle-student-overage`)

### Categoria: Dependentes e Grupos Mistos (expandir)
Cenarios de grupo misto que faltavam:

- Fatura manual consolidando multiplos dependentes (2 filhos na mesma fatura)
- Feedback em grupo misto: adulto recebe o dele, responsavel recebe o do filho
- Professor cancela grupo misto inteiro (notificacao para todos os pagantes corretos)

### Categoria: Recorrencia (expandir)
- Grupo recorrente finito: verificar se ocorrencias aparecem no calendario de todos
- Materializacao de aula virtual (cron/Edge Function `materialize-virtual-class`)
- Conflito entre recorrencias (tentar agendar recorrencia que sobrepoe outra existente)

### Categoria: Seguranca e RLS (nova secao)
- Professor A tenta acessar faturas do Professor B via URL direta
- Aluno A tenta abrir fatura do Aluno B por ID
- Responsavel tenta ver relatorio de aluno nao vinculado
- Aluno tenta alterar preco via console/API (RLS bloqueia)
- Validacao de API: enviar duracao negativa ou texto (Zod/backend barra)
- Deletar aluno com faturas pagas (`smart-delete-student` -- dados fiscais persistem)

### Categoria: UX e Usabilidade (nova secao)
- Timezone: professor BR agenda 10h, aluno em fuso diferente ve horario correto
- Upload de PDF (4MB) no relatorio de aula
- Tentativa de upload > 10MB (erro amigavel)
- Aluno baixa material compartilhado sem erros
- Reenvio de convite ao aluno (`resend-student-invitation`)
- Mobile: calendario colapsa para lista em viewport < 768px
- Mobile: sidebar fecha ao clicar em menu
- Tema claro/escuro sem componentes ilegiveis
- Impressao de recibo (Ctrl+P omite menus laterais)

---

## Cenarios do Gemini DESCARTADOS

- **#49 Professor substituto:** Funcionalidade nao existe no sistema
- **#61 MFA/bloqueio login:** Configuracao do Supabase Auth, nao do app
- **#62 Token expirado:** Comportamento padrao do Supabase, nao customizado
- **#75 Cookie consent:** Periferico ao fluxo de aulas
- **#80 Derrubar banco:** Teste de infraestrutura, nao E2E de aplicacao
- **#71 Dashboard MRR:** Calculo financeiro, nao fluxo de aula
- **#72 Multi-idioma:** Teste de traducao, nao fluxo critico

---

## Estrutura Final do Documento

O documento sera reorganizado em 6 categorias:

1. **Fluxos Core** -- Individuais, grupos simples, gratuitas (24 cenarios existentes)
2. **Stripe e Financeiro** -- Checkout, faturas, refunds, inadimplencia (12 novos)
3. **Dependentes e Grupos Mistos** -- T2/T4 com roteamento de faturas (existentes + 3 novos)
4. **Recorrencia e Excecoes** -- R1/R2, cancelar ocorrencia, encerrar (existentes + 3 novos)
5. **Seguranca e RLS** -- Isolamento, validacao, feature gates (6 novos)
6. **UX e Usabilidade** -- Mobile, uploads, timezone, tema (9 novos)

Total: **80 cenarios** (52 existentes + 28 novos), renumerados sequencialmente.

---

## Detalhes Tecnicos

### Arquivos adicionados a tabela de referencia
| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/contexts/SubscriptionContext.tsx` | Deteccao de payment failure |
| `src/components/StudentSelectionBlocker.tsx` | Bloqueio de inadimplente |
| `src/components/StripeConnectOnboarding.tsx` | Onboarding KYC |
| `src/components/FinancialRouteGuard.tsx` | Restricao por assinatura |
| `src/components/SystemHealthAlert.tsx` | Alertas de saude |
| `src/components/CreateInvoiceModal.tsx` | Fatura manual com boleto |
| `supabase/functions/process-orphan-cancellation-charges/index.ts` | Taxas orfas |
| `supabase/functions/handle-student-overage/index.ts` | Overage de alunos |
| `supabase/functions/smart-delete-student/index.ts` | Exclusao segura |
| `supabase/functions/materialize-virtual-class/index.ts` | Materializacao recorrente |

### Alteracao no arquivo
- `docs/e2e-test-plan-classes.md`: Reescrita completa mantendo todos os 52 cenarios existentes e adicionando 28 novos, reorganizados em 6 categorias tematicas.

