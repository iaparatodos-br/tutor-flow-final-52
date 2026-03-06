

# Roteiro 14 — Validacao de API e Regras de Negocio: Analise

## Resumo

Analisei os 3 cenarios. **Nenhum erro bloqueante encontrado.**

---

## Passo 1 — Duracao negativa ou texto `[#70]`
**Status: OK**

- No `ClassForm.tsx` linha 371, a validacao frontend rejeita duracoes fora de 15-480 minutos: `formData.duration_minutes < 15 || formData.duration_minutes > 480`
- O campo `duration_minutes` usa `type="number"` com `min="15"` e `max="480"` no HTML
- No banco, existe CHECK constraint nas tabelas `classes` e `class_services` que limita entre 15 e 480 (conforme memoria do projeto)
- Valores negativos (-30) ou texto ("abc") sao rejeitados pelo frontend (NaN falha na validacao) e pelo banco (CHECK constraint)

---

## Passo 2 — Pre-Pago + Recorrencia Infinita `[#71]`
**Status: OK**

- `ClassForm.tsx` linha 260: `const isRecurrenceBlocked = chargeTiming === 'prepaid' && formData.is_paid_class`
- Quando `isRecurrenceBlocked = true`:
  - O checkbox de recorrencia fica `disabled` (linha 803)
  - O card fica com `opacity-60` (linha 783)
  - A descricao exibe mensagem de bloqueio `recurrenceBlockedPrepaid` (linha 793)
  - O `onCheckedChange` retorna imediatamente sem alterar estado (linha 805)
- Na submissao (linha 395-401), `showRecurrence` permanece `false`, entao `recurrence` e `undefined`
- A combinacao Pre-Pago + Recorrencia esta corretamente bloqueada na UI

---

## Passo 3 — smart-delete-student com faturas pagas `[#72]`
**Status: OK**

- `smart-delete-student/index.ts` linhas 720-752:
  1. Consulta faturas com status `paga` ou `concluida` (linha 724-725)
  2. Se existem faturas pagas (`paidInvoicesCount > 0`): faz **soft-delete** — atualiza o profile com `role: 'deleted'`, muda email para `deleted_{id}@removed.local`, preserva o `name` original (linhas 737-744)
  3. **NAO** deleta o usuario do auth (linha 752: "Do NOT delete auth user")
  4. Os registros de `invoices` e `invoice_classes` com status `paga`/`concluida` sao preservados ao longo de todo o fluxo (linhas 662-673: filtra com `.not('invoices.status', 'in', '("paga","concluida")')`)
- Resultado: aluno desaparece da UI (role = 'deleted'), mas dados fiscais (faturas pagas, itens de fatura, participacoes associadas) permanecem intactos no banco

---

## Conclusao

Todos os 3 cenarios passam sem erros. Nenhuma alteracao de codigo necessaria.

