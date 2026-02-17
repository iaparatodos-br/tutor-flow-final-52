

# Verificacao Final v5.65 — 2 Inconsistencias Finais

## Status Geral

O documento esta em otimo estado apos 5 rodadas de correcao. Categorias A-L somam corretamente **148 itens (141 unicos)**, tabela de cobertura esta expandida com funcoes reclassificadas, padroes sistemicos documentados, e nota de consolidacao precisa. Restam **2 inconsistencias** que devem ser corrigidas para uso como checklist final.

---

## Problema 1: Funcoes Duplicadas em Cobertura E Fora de Escopo

Duas funcoes aparecem simultaneamente na **Tabela de Cobertura** (linhas 3281-3282) e na lista **"Fora de Escopo"** (linha 3189):

| Funcao | Na Cobertura (achados) | Em Fora de Escopo |
|--------|----------------------|-------------------|
| `resend-confirmation` | #358 (Cat A — Fase 0: sem auth, spam de emails) | Sim (Auth/Onboarding) |
| `resend-student-invitation` | #220, #399 | Sim (Auth/Onboarding) |

Ambas possuem achados documentados e pertencem a Tabela de Cobertura. `resend-confirmation` inclusive tem o item #358 ativo na Fase 0 (Categoria A). Mante-las em "Fora de Escopo" contradiz a definicao "sem vulnerabilidades criticas".

**Correcao**: Remover `resend-confirmation` e `resend-student-invitation` da tabela "Fora de Escopo" (linha 3189). Atualizar contagem de 11 para **9 funcoes**.

---

## Problema 2: Changelog v5.65 com Contagem Desatualizada

A entrada do changelog na linha 4839 diz "Fase 0: 162 itens", que era o valor ANTES da deduplicacao e reconciliacao feita nas rodadas anteriores. O valor correto (conforme cabecalho e totais finais) e **148 itens listados (141 unicos)**.

**Correcao**: Atualizar a linha 4839 para "Fase 0: 148 itens listados (141 unicos)".

---

## Secao Tecnica: Alteracoes no Documento

### Arquivo: `docs/hybrid-billing-implementation-plan.md`

1. **Linha 3183**: Alterar `(11 funcoes)` para `(9 funcoes)`
2. **Linha 3189**: Remover `resend-confirmation` e `resend-student-invitation` da linha Auth/Onboarding. Resultado: `| Auth/Onboarding | create-teacher, check-email-confirmation |`
3. **Linha 4839**: Alterar "Fase 0: 162 itens" para "Fase 0: 148 itens listados (141 unicos)"

### Verificacao Pos-Correcao

- Fora de Escopo: 9 funcoes (4 ficam em Auth/Onboarding → 2, Dados/Consulta 4, Dev/Test 2, Outros 1)
- Cobertura: 65 funcoes (ja inclui resend-confirmation e resend-student-invitation)
- Total: 65 + 9 + 1 (_shared) = **75 funcoes** (consistente com o cabecalho)
- Fase 0: **148 listados / 141 unicos** (consistente em cabecalho, nota e changelog)

### Estimativa de Impacto

Nenhuma alteracao de codigo. Apenas 3 linhas de correcao no documento de planejamento.

