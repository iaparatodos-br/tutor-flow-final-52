

# Revisao do Plano de Testes E2E -- Lacunas Encontradas

## Resumo da Analise

Apos cruzar o documento `docs/e2e-test-plan-classes.md` com o codigo real dos componentes (`ClassForm`, `CancellationModal`, `ClassReportModal`, `StudentScheduleRequest`, `AmnestyButton`, `RecurringClassActionModal`), identifiquei **10 cenarios ausentes** que precisam ser adicionados.

---

## Lacunas Encontradas

### 1. Confirmacao de Aula (S6) -- Nenhum caso de teste
O eixo S6 (Confirmacao de aula) esta definido na matriz mas **nao aparece em nenhum cenario da checklist**. Faltam pelo menos:
- Confirmar aula individual
- Confirmar aula em grupo (confirmar participacao de cada aluno)

### 2. Conclusao de aula em grupo e com dependente
Existe teste para concluir aula individual (#2), mas faltam:
- T3+R0+C1+S7: Concluir aula em grupo
- T2+R0+C1+S7: Concluir aula com dependente

### 3. Relatorio de aula com dependente
Existe teste para relatorio individual (#7) e grupo (#19), mas falta:
- T2+R0+C1+S8: Relatorio de aula com dependente (verificar feedback vinculado ao dependente)

### 4. Professor cancela aula em grupo
Existe teste para aluno cancelar parcialmente (#18), mas falta:
- T3+R0+C1+S3: Professor cancela aula em grupo inteira

### 5. Cancelamento de aula gratuita
Existe teste para agendar aula gratuita (#20), mas falta testar que cancelamento nao gera cobranca:
- T1+R0+C0+S3: Professor cancela aula gratuita (sem cobranca)
- T1+R0+C0+S4: Aluno cancela aula gratuita (sem cobranca)

### 6. Recorrencia com grupo
Existe T3+R1+C1+S1 (#27), mas falta:
- T3+R2+C1+S1: Grupo com recorrencia infinita

### 7. Frequencias de recorrencia
O formulario suporta 3 frequencias (semanal, quinzenal, mensal) mas nenhum teste valida especificamente quinzenal ou mensal.

### 8. Anistia para dependente
Falta cenario especifico:
- T2+R0+C1+S9: Anistia em aula com dependente

---

## Alteracoes Propostas no Documento

### Adicionar na Prioridade Alta

```text
| #  | Cenario                                           | Status | Notas |
| -- | ------------------------------------------------- | ------ | ----- |
| X  | T1+R0+C1+S6: Confirmar aula individual            | [ ]    |       |
| X  | T3+R0+C1+S7: Concluir aula em grupo               | [ ]    |       |
| X  | T2+R0+C1+S7: Concluir aula com dependente         | [ ]    |       |
| X  | T3+R0+C1+S3: Professor cancela grupo inteiro       | [ ]    |       |
```

### Adicionar na Prioridade Media

```text
| #  | Cenario                                           | Status | Notas |
| -- | ------------------------------------------------- | ------ | ----- |
| X  | T2+R0+C1+S8: Relatorio aula com dependente        | [ ]    |       |
| X  | T1+R0+C0+S3: Cancelar aula gratuita (sem cobranca)| [ ]    |       |
| X  | T1+R0+C0+S4: Aluno cancela gratuita (sem cobranca)| [ ]    |       |
| X  | T3+R2+C1+S1: Grupo com recorrencia infinita        | [ ]    |       |
| X  | T2+R0+C1+S9: Anistia em aula com dependente        | [ ]    |       |
```

### Adicionar na Prioridade Baixa

```text
| #  | Cenario                                           | Status | Notas |
| -- | ------------------------------------------------- | ------ | ----- |
| X  | T1+R1+C1+S1: Recorrencia quinzenal (frequencia)    | [ ]    |       |
| X  | T1+R1+C1+S1: Recorrencia mensal (frequencia)       | [ ]    |       |
```

### Remover da Matriz de Acoes

Remover **S6 (Confirmacao de aula)** se o sistema nao possui essa acao como funcionalidade distinta, OU manter e adicionar os testes acima. Isso depende de como funciona no sistema -- se a confirmacao e automatica ou manual.

---

## Resumo das Alteracoes

- **Adicionar 11 novos cenarios** distribuidos entre as 3 prioridades
- **Renumerar** todos os cenarios sequencialmente (#1 a #52)
- Manter a estrutura e formato existentes do documento
- Nenhuma alteracao na matriz de eixos (ja esta correta)
