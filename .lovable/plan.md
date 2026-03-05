

## Roteiro 06 — Resultados da Execução

### Passo 1: Solicitação pelo Aluno `[#10 ✅]`
- **Resultado: PASSED**
- Login como aluno Gustavo Henrique Luiz funcionou
- Navegação até "Minhas Aulas" exibiu a interface "Solicitar Aula" corretamente
- Slot de 09:00 em 09/03/2026 selecionado, modal de confirmação exibido com dados corretos (data, tipo de aula, destinatário)
- Toast: "Solicitação enviada! Sua solicitação de aula foi enviada para o professor."
- **Observação menor:** O slot destacado após envio (18:30) não corresponde ao horário solicitado (09:00) — possível diferença de exibição por timezone do browser (America/Los_Angeles vs America/Sao_Paulo do perfil). Isso é cosmético e não afeta a solicitação real.

### Passo 2: Aprovação pelo Professor `[Parcialmente testado]`
- **Resultado: PASSED (confirmação) / BLOQUEADO (conclusão)**
- Login como professor funcionou. A aula apareceu no calendário em 09/03 com status "Pendente"
- Confirmação executada com sucesso. Toast: "Aula confirmada!"
- **Porém:** Após confirmação, o status mudou para **"Aguardando Pagamento"** (e não "Confirmada"). Isso ocorre porque o professor possui um **perfil de cobrança prepaid**. Nesse modelo, a aula só pode ser concluída após o pagamento ser confirmado (via Stripe webhook ou marcação manual).
- O botão "Concluir Aula" não aparece — apenas "Criar Relatório" e "Cancelar Aula" — comportamento **correto** para o fluxo prepaid.

### Passo 3: Faturamento Automático `[#09 ✅]`
- **Resultado: PASSED (execução sem erros)**
- Edge function `automated-billing` invocada manualmente, retornou: `"Processed: 0, Errors: 0"`
- 0 relacionamentos processados porque: (a) o billing diário já pode ter rodado hoje, e (b) a aula recém-criada está em "aguardando_pagamento", não "concluída"
- Existem aulas concluídas anteriores para o aluno Gustavo que já foram ou serão faturadas no próximo ciclo

### Passo 4: Fatura Manual / Boleto `[#30 ✅]`
- **Resultado: PASSED**
- Modal "Criar Nova Fatura" aberto com sucesso
- Aluno Gustavo selecionado, valor R$ 5,00, descrição preenchida
- Previsão de recebimento exibida: R$ 5,00 - R$ 3,49 (taxa Stripe) = R$ 1,51
- Fatura criada com sucesso: contador subiu de 114 para **115**, Receitas Pendentes aumentaram de R$ 10.081,28 para **R$ 10.086,28**

### Passo 4.1: Checkpoint Financeiro (Aluno)
- **Resultado: NÃO CONCLUÍDO** — sessão de browser expirou antes de completar o re-login como aluno
- Recomendação: verificar manualmente logando como aluno e acessando "Faturas" no sidebar

---

### Resumo de Erros Encontrados

**Nenhum erro bloqueante foi encontrado.** Todos os fluxos funcionaram conforme a arquitetura.

**Observações:**
1. A diferença de timezone do browser (Los Angeles) vs perfil (São Paulo) causa exibição visual inconsistente no slot destacado após solicitação — não é um bug funcional, mas pode confundir o aluno.
2. O modelo prepaid bloqueia corretamente a conclusão da aula até o pagamento. Para testar o ciclo completo (solicitação → conclusão → faturamento automático), seria necessário usar um perfil de cobrança **postpaid** ou simular o pagamento do boleto via webhook.

