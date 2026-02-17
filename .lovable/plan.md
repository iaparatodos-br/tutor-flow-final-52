

# Verificacao Final v5.65 — Correcoes Residuais

## Diagnostico

Apos leitura completa das 5205 linhas do documento, confirmo que a consolidacao anterior (aprovada no ultimo ciclo) resolveu os 8 problemas principais. O documento agora possui:

- Fase 0 consolidada com 12 categorias (A-L) e 162 itens listados
- Funcoes reclassificadas de "Fora de Escopo" para cobertura (6 funcoes)
- Padroes Sistemicos Consolidados (4 padroes documentados)
- Changelog v5.62-v5.65 presente
- Memorias atualizadas (24 entradas)
- Totais finais corretos (577/547/535/162)

Porem, restam **5 inconsistencias menores** que impedem o uso como checklist 100% confiavel.

## Problemas Residuais Encontrados

### 1. Conteudo Orfao no Final do Documento (Linhas 5200-5205)

Apos a secao "Totais Finais" (que termina na linha 5199 com o bloco de codigo), ha conteudo solto:
- Linha 5200: `- create-connect-account -- auth + ownership validation via payment_account_id + teacher_id` (fragmento de lista de funcoes com bom padrao, que deveria estar na secao da 28a passagem)
- Linhas 5202-5205: Bloco duplicado "Totais Atualizados (v5.65)" que repete informacao ja presente nas linhas 5184-5198

**Correcao**: Remover linhas 5200-5205.

### 2. Categoria L da Fase 0 Incompleta (Linha 502)

A nota na linha 502 admite: "Os itens das passagens 19-24 (#403-#505) que nao estao listados acima mas foram marcados como Fase 0 nas suas respectivas secoes de passagem tambem fazem parte deste batch."

Isso significa que ha itens de Fase 0 das passagens 19-24 que NAO estao nas tabelas consolidadas. Para ser um checklist confiavel, todos os 162 itens devem estar visiveis.

**Correcao**: Revisar as passagens 19-24 e adicionar os itens faltantes a Categoria L ou a categoria apropriada. Alternativamente, remover a nota e garantir que a contagem nas tabelas soma exatamente 162.

### 3. Changelog em Dois Locais Disjuntos

O changelog principal (passagens 1-24) termina na linha 4812 com v5.61. As entradas v5.62-v5.65 foram adicionadas em uma secao separada na linha 5144 ("Changelog v5.62-v5.65"). Isso cria dois locais para consulta.

**Correcao**: Mover as 4 entradas da linha 5144-5151 para o final do changelog principal (apos linha 4812), e remover a secao separada.

### 4. Tabela de Cobertura com Pontas Faltantes (2 funcoes)

- `generate-boleto-for-invoice` (linha 3209): lista apenas #103, #121. Faltam **#532** (sem auth IDOR + PII da 26a passagem) e **#533** (FK joins da 26a passagem).
- `check-business-profile-status` (linha 3242): lista apenas #142, #286. Faltam **#513, #523** (25a passagem), **#570, #571, #579** (28a passagem).

**Correcao**: Adicionar os achados faltantes nas duas linhas da tabela de cobertura.

### 5. send-password-reset na Lista de Notificacoes sem Auth

Na secao "Padroes Sistemicos Consolidados" (linha 5092), `send-password-reset` esta listada como item 10 de 10 funcoes sem auth. Porem, esta funcao e INTENCIONALMENTE sem auth (endpoint de recuperacao de senha -- o usuario nao esta logado). Incluir na lista de "vulnerabilidades" e misleading.

**Correcao**: Substituir `send-password-reset` por `generate-teacher-notifications` (que ja esta na tabela da linha 5128 mas nao na lista numerada da linha 5092). Adicionar nota: "send-password-reset e intencionalmente sem auth (recovery flow)".

## Secao Tecnica: Alteracoes

### Arquivo: `docs/hybrid-billing-implementation-plan.md`

1. **Remover linhas 5200-5205** (conteudo orfao e bloco duplicado)
2. **Atualizar linha 3209** para: `generate-boleto-for-invoice | #103, #121, #532, #533 | (v5.63)`
3. **Atualizar linha 3242** para: `check-business-profile-status | #142, #286, #513, #523, #570, #571, #579 | (v5.65)`
4. **Mover changelog v5.62-v5.65** (linhas 5144-5153) para apos linha 4812 e remover secao separada
5. **Corrigir lista de notificacoes** (linha 5092): substituir send-password-reset por generate-teacher-notifications com nota
6. **Remover ou resolver nota da linha 502**: contar itens nas tabelas A-L e garantir que somam 162, ou adicionar itens faltantes

### Estimativa de Impacto

Nenhuma alteracao de codigo. Apenas correcoes cosmeticas e de consistencia interna do documento de planejamento.

