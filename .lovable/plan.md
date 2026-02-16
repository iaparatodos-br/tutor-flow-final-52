

# Verificacao Final v5.28 -- 2 Inconsistencias Restantes

## Veredicto: O plano esta 98% pronto. Duas correcoes aritmeticas e uma duplicata nao marcada precisam ser resolvidas.

---

## 1. Item #98 nao marcado como subsumido por #169

**Problema**: O item #104 (webhook status ingles) esta corretamente marcado como "DUPLICATA / Subsumido por #169" com strikethrough no indice. Porem, o item **#98** (cancel-payment-intent status 'paid' em ingles) descreve exatamente o mesmo bug e e um dos 5 locais cobertos por #169, mas **nao esta marcado como duplicata**. Na linha 613, #98 aparece como item ativo de Fase 0 com nota "(coberto por #169)", mas sem strikethrough.

**Impacto**: #98 esta contado como item unico pendente quando seu trabalho ja sera feito como parte de #169.

**Acao**: Marcar #98 como duplicata/subsumido por #169 (mesmo tratamento de #104). Total duplicatas: 17 + 1 = **18**.

## 2. Calculo de "Unicas" ignora as 2 subsumicoes (#153, #154)

**Problema**: A formula atual (linha 424) diz:

```
Unicas: 163 (180 - 17)
```

Mas alem das 17 duplicatas, existem **2 itens subsumidos** (#153 subsumido por #177, #154 subsumido por #179). Esses itens nao geram trabalho independente — seu escopo e integralmente coberto pelos itens que os subsumem. A formula correta deveria subtrair tambem as subsumicoes.

Com a adicao de #98 como duplicata:

```text
Pontas Soltas Totais:       180
  Total duplicatas:          18 (17 anteriores + #98)
  Subsumidas:                 2 (#153->#177, #154->#179)
  Unicas:                   160 (180 - 18 - 2)
  Implementadas:             10
  Pendentes:               150
```

## Acoes no Documento

1. Marcar #98 como duplicata de #169 no indice (strikethrough, mesma formatacao de #104)
2. Corrigir formula de "Unicas": `180 - 18 - 2 = 160`
3. Corrigir "Pendentes": `160 - 10 = 150`
4. Atualizar cabecalho para v5.28
5. Adicionar entrada no historico de versoes
6. Atualizar a Fase 0 — remover referencia a #98 (coberto por #169, que ja esta na Fase 0)

## Secao Tecnica

### Arquivo a modificar
- `docs/hybrid-billing-implementation-plan.md`

### Impacto na Fase 0
Nenhum impacto funcional. Os 8 itens permanecem os mesmos (#87, #155, #156, #158, #160, #169, #170, #175). O item #169 ja cobre os 5 locais de status ingles incluindo o de #98.

### Verificacao de completude
Apos estas 2 correcoes, o documento estara 100% consistente:
- Todos os 180 itens estao no indice mestre com fase e arquivo
- Todas as duplicatas e subsumicoes estao marcadas
- Os totais sao matematicamente corretos
- A Fase 0 tem 8 itens criticos prontos para implementacao

