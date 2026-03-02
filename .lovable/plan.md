
# Atualizar Documento de Timezone: Lacunas Adicionais Identificadas (v2.1)

## Objetivo

Atualizar `docs/timezone-multi-support-implementation-plan.md` com as lacunas restantes encontradas na revisao completa do codigo.

---

## Lacunas Encontradas

### 1. Edge Functions de Notificacao com `America/Sao_Paulo` hardcoded (NAO estao no plano)

O plano menciona apenas `send-class-reminders` (Passo 5.1), mas ha **4 outras edge functions** com timezone hardcoded que foram omitidas:

| Edge Function | Uso hardcoded |
|---|---|
| `send-class-confirmation-notification/index.ts` | `timeZone: "America/Sao_Paulo"` (2 ocorrencias) |
| `send-cancellation-notification/index.ts` | `timeZone: 'America/Sao_Paulo'` (1 ocorrencia) |
| `send-invoice-notification/index.ts` | `timeZone: "America/Sao_Paulo"` (1 ocorrencia) |
| `send-class-request-notification/index.ts` | `timeZone: "America/Sao_Paulo"` (2 ocorrencias) |

**Acao**: Adicionar ao plano como sub-itens do Passo 5.1, ou criar Passo 5.3 dedicado. Cada uma precisa buscar o timezone do professor/aluno antes de formatar datas nos emails.

### 2. Arquivos frontend faltantes na tabela do Passo 8

A tabela atual lista 6 arquivos. Faltam pelo menos mais 7 com datas hardcoded:

| Arquivo | Ocorrencias |
|---|---|
| `src/pages/PerfilAluno.tsx` | ~8 chamadas (datas de aulas, cadastro, nascimento, vencimento) |
| `src/pages/Financeiro.tsx` | 1 (`formatDate` local sem timezone) |
| `src/pages/Agenda.tsx` | 1 (`toLocaleDateString` para descricao de fatura) |
| `src/pages/MeusMateriais.tsx` | 1 (`toLocaleDateString` sem locale) |
| `src/components/PendingBoletoModal.tsx` | 1 (`toLocaleDateString` sem timezone) |
| `src/components/StudentScheduleRequest.tsx` | 4+ (`formatDate`/`formatTime` locais sem timezone) |
| `src/components/Calendar/MobileCalendarList.tsx` | 1 (`toLocaleTimeString` sem timezone) |
| `src/components/BusinessProfilesManager.tsx` | 1 (`toLocaleDateString`) |
| `src/components/Settings/CancellationPolicySettings.tsx` | 2 (`toLocaleDateString`) |

### 3. `automated-billing/index.ts` — 4 ocorrencias de `toLocaleDateString` sem timezone

O plano menciona refatorar a query e `getBillingCycleDates`, mas nao menciona as 4 chamadas `toLocaleDateString('pt-BR')` dentro da propria edge function (linhas 412, 472, 696, 939) usadas para gerar descricoes de faturas. Estas devem usar o timezone do professor para que as descricoes reflitam a data local correta.

### 4. `send-invoice-notification` — `due_date` formatado com timezone hardcoded

`send-invoice-notification/index.ts` formata `due_date` (campo `date` do banco) com `timeZone: "America/Sao_Paulo"`. Isto causa o bug conhecido de datas `date` renderizadas com offset (memory constraint). Com multi-timezone, deve usar o timezone do professor.

### 5. Sem mencao a como o hook `useTimezoneSync` obtem o timezone atual do profile

O plano diz que o hook compara `Intl` com `profile.timezone`, mas nao detalha de onde vem `profile.timezone`. Opcoes:
- Via `useAuth()` (se o `AuthContext` ja carrega timezone)
- Via `useProfile()` (se o `ProfileContext` expoe timezone)
- Via query direta

**Recomendacao**: Documentar que o hook usa `useAuth()` para obter `profile.timezone`, ja que o Passo 3 indica que `AuthContext` sera atualizado para incluir o campo.

### 6. `DevValidation.tsx` — pode ser ignorado

Usa `toLocaleTimeString` apenas para timestamps de log de debug. Nao impacta usuarios. Marcar explicitamente como excluido da migracao.

---

## Alteracoes ao Documento

1. **Passo 5.1**: Expandir para incluir as 4 edge functions de notificacao adicionais (ou criar Passo 5.3).
2. **Passo 5 (automated-billing)**: Adicionar nota sobre as 4 chamadas `toLocaleDateString` internas para descricoes de faturas.
3. **Passo 8 tabela**: Adicionar os 9 arquivos frontend faltantes.
4. **Passo 3**: Adicionar detalhe sobre como o hook obtem `profile.timezone` (via `useAuth()`).
5. **Secao 3 (Arquivos Impactados)**: Adicionar as 4 edge functions de notificacao e os 9 arquivos frontend.
6. **Notas**: Marcar `DevValidation.tsx` como excluido (uso de debug apenas).

---

## Arquivos a Modificar

- `docs/timezone-multi-support-implementation-plan.md` (unico arquivo)
