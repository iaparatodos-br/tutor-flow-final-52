

# Verificacao Final v5.65 — 3 Inconsistencias Residuais

## Status Geral

O documento esta em excelente estado apos as 4 rodadas de correcao anteriores. Categorias A-L somam corretamente 148 itens (141 unicos), changelog esta consolidado, padroes sistemicos documentados, e totais finais corretos. Porem, restam **3 inconsistencias** que podem causar confusao durante a implementacao.

---

## Problema 1: Contagem "Fora de Escopo" Errada

**Local**: Linha 3183 — `Funcoes Fora de Escopo (21 funcoes — atualizado v5.65)`

O titulo afirma 21 funcoes, mas a tabela lista apenas **18**:
- Setup/Cron: 5 funcoes
- Auth/Onboarding: 5 funcoes
- Dados/Consulta: 5 funcoes
- Dev/Test: 2 funcoes
- Outros: 1 funcao

**Correcao**: Alterar titulo para `(18 funcoes — atualizado v5.65)`.

---

## Problema 2: Funcoes com Vulnerabilidades Fase 0 Classificadas como "Fora de Escopo — sem vulnerabilidades"

**Local**: Linha 3185 — "sem vulnerabilidades identificadas"

Sete funcoes listadas como "Fora de Escopo" possuem itens ativos na Fase 0:

| Funcao (Fora de Escopo) | Itens Fase 0 | Categoria |
|-------------------------|-------------|-----------|
| check-email-availability | #402 | Cat A (sem auth + enumeracao) |
| get-teacher-availability | #405 | Cat E (FK join proibido) |
| setup-billing-automation | #315 | Cat K (ANON_KEY inline) |
| setup-class-reminders-automation | #316, #495 | Cat K (ANON_KEY + SQL injection) |
| setup-expired-subscriptions-automation | #317 | Cat K (ANON_KEY inline) |
| setup-invoice-auto-verification | #318 | Cat K (ANON_KEY inline) |
| setup-orphan-charges-automation | #319 | Cat K (ANON_KEY inline) |

**Correcao**: Mover estas 7 funcoes da lista "Fora de Escopo" para a Tabela de Cobertura, com seus achados documentados. Atualizar o titulo para `(11 funcoes)` e remover a afirmacao "sem vulnerabilidades identificadas" (substituir por "sem vulnerabilidades criticas de logica de negocio"). Atualizar a contagem de funcoes: cobertura passa de ~57 para ~64, fora de escopo de 18 para 11, total 64 + 11 = 75 (mantendo consistencia).

---

## Problema 3: Itens Errados na Tabela de Cobertura (check-subscription-status)

**Local**: Linha 3229 — `check-subscription-status | #116, #217, #283, #351, #401, #402 |`

Os itens #401 e #402 estao incorretamente atribuidos a `check-subscription-status`:
- #401 pertence a `stripe-events-monitor` (sem auth) — ja listado na linha 3258
- #402 pertence a `check-email-availability` (sem auth + enumeracao) — atualmente em "Fora de Escopo"

**Correcao**: Remover #401 e #402 da linha de `check-subscription-status`. O #402 sera adicionado a nova entrada de `check-email-availability` na tabela de cobertura (Problema 2).

---

## Secao Tecnica: Alteracoes no Documento

### Arquivo: `docs/hybrid-billing-implementation-plan.md`

1. **Linha 3183**: Alterar `(21 funcoes)` para `(11 funcoes)`
2. **Linha 3185**: Alterar "sem vulnerabilidades identificadas" para "sem vulnerabilidades criticas de logica de negocio no escopo do plano hibrido"
3. **Tabela "Fora de Escopo" (linhas 3187-3193)**: Remover as 7 funcoes reclassificadas das linhas da tabela
4. **Linha 3229**: Remover `#401, #402` da entrada de `check-subscription-status`
5. **Tabela de Cobertura (apos linha 3267)**: Adicionar 7 novas entradas:
   - `check-email-availability | #402 |`
   - `get-teacher-availability | #405 |`
   - `setup-billing-automation | #315 |`
   - `setup-class-reminders-automation | #316, #495 |`
   - `setup-expired-subscriptions-automation | #317 |`
   - `setup-invoice-auto-verification | #318 |`
   - `setup-orphan-charges-automation | #319 |`
6. **Nota de reclassificacao (linha 3195)**: Expandir para incluir as 7 novas funcoes reclassificadas (total de 13 reclassificacoes)

### Estimativa de Impacto

Nenhuma alteracao de codigo. Apenas correcoes de consistencia interna do documento para garantir que nenhuma funcao com vulnerabilidades Fase 0 esteja erroneamente classificada como "sem vulnerabilidades".

