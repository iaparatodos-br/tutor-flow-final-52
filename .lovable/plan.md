

# Correcao Final v5.28.2 -- 2 Duplicatas ausentes do indice mestre

## Veredicto: O plano esta 99% pronto. Duas entradas de duplicatas faltam no indice.

---

## Problema Encontrado

Os itens **#95** e **#96** estao corretamente listados na tabela de duplicatas (linhas 407-408):

```
| #95 | #155 | check-overdue-invoices race condition (Fase 0 via #155) |
| #96 | #80  | process-cancellation SERVICE_ROLE_KEY (Fase 6 via #80)  |
```

Porem, eles **nao aparecem no indice mestre** (linhas 517-694) com strikethrough. Todos os outros 16 duplicatas estao corretamente marcados no indice. Apenas #95 e #96 foram omitidos.

**Impacto**: Durante a implementacao, alguem pode procurar o #95 ou #96 no indice e nao encontrar, gerando confusao sobre se esses itens existem ou nao.

## Acao

Adicionar #95 e #96 ao indice mestre com strikethrough, posicionados entre #94 e #97 (linhas 612-613):

```markdown
| ~~**95**~~ | ~~**DUPLICATA de #155 — check-overdue-invoices race condition**~~ | **—** | **—** |
| ~~**96**~~ | ~~**DUPLICATA de #80 — process-cancellation SERVICE_ROLE_KEY**~~ | **—** | **—** |
```

## Verificacao Completa

Apos esta correcao, todas as 18 duplicatas estarao presentes no indice mestre:

1. ~~#59~~ (linha 575) -- ok
2. ~~#61~~ (linha 577) -- ok
3. ~~#62~~ (linha 578) -- ok
4. ~~#63~~ (linha 579) -- ok
5. ~~#65~~ (linha 581) -- ok
6. ~~#66~~ (linha 582) -- ok
7. ~~#81~~ (linha 597) -- ok
8. ~~#92~~ (linha 608) -- ok
9. ~~#93~~ (linha 609) -- ok
10. **~~#95~~** -- FALTANDO (a adicionar)
11. **~~#96~~** -- FALTANDO (a adicionar)
12. ~~#98~~ (linha 614) -- ok
13. ~~#104~~ (linha 620) -- ok
14. ~~#107~~ (linha 610) -- ok
15. ~~#108~~ (linha 611) -- ok
16. ~~#166~~ (linha 680) -- ok
17. ~~#171~~ (linha 685) -- ok
18. ~~#178~~ (linha 692) -- ok

Totais permanecem inalterados:
- 180 total, 18 duplicatas, 2 subsumidas, 160 unicas, 10 implementadas, 150 pendentes
- Fase 0: 8 itens criticos inalterados

## Secao Tecnica

### Arquivo a modificar
- `docs/hybrid-billing-implementation-plan.md`: Adicionar #95 e #96 ao indice (entre linhas 612 e 613), atualizar versao para v5.28.2, adicionar entrada no historico

### Impacto
Nenhum impacto funcional. Correcao de completude do indice para rastreamento confiavel durante implementacao.

