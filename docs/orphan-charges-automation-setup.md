# Configuração da Automação de Cobranças Órfãs

Este documento descreve como configurar e ativar a automação que processa cobranças de cancelamento órfãs.

## O que são Cobranças Órfãs?

Cobranças órfãs são classes canceladas que tiveram `charge_applied: true` mas ainda não foram faturadas (`billed: false`) após mais de 45 dias. Essas cobranças precisam ser consolidadas em faturas para não se perderem.

## Pré-requisitos

- Edge Function `process-orphan-cancellation-charges` implementada
- Edge Function `setup-orphan-charges-automation` implementada
- Função RPC `create_invoice_and_mark_classes_billed` criada no banco de dados
- Permissões necessárias configuradas no Supabase

## Passo 1: Ativar a Automação

Execute a Edge Function `setup-orphan-charges-automation` para criar o cron job:

### Via Dashboard do Supabase

1. Acesse: https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions/setup-orphan-charges-automation/logs
2. Use a interface de invocação manual
3. Ou use curl:

```bash
curl -X POST \
  'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/setup-orphan-charges-automation' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

### Resposta Esperada

```json
{
  "success": true,
  "message": "Automação de cobranças órfãs configurada com sucesso",
  "schedule": "0 2 * * 1 (toda segunda-feira às 02:00)",
  "function": "process-orphan-cancellation-charges"
}
```

## Passo 2: Testar Execução Manual

Antes de confiar no cron job, teste a execução manual:

```bash
curl -X POST \
  'https://nwgomximjevgczwuyqcx.supabase.co/functions/v1/process-orphan-cancellation-charges' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

### Resposta Esperada (sem cobranças órfãs)

```json
{
  "success": true,
  "message": "Processamento concluído",
  "processedCount": 0,
  "invoicesCreated": 0,
  "errors": []
}
```

### Resposta Esperada (com cobranças órfãs)

```json
{
  "success": true,
  "message": "Processamento concluído",
  "processedCount": 5,
  "invoicesCreated": 2,
  "errors": [],
  "details": [
    {
      "teacher_id": "uuid-here",
      "student_id": "uuid-here",
      "classes_count": 3,
      "total_amount": 150.00,
      "invoice_id": "uuid-here"
    }
  ]
}
```

## Passo 3: Verificar Logs

Monitore os logs da função para garantir que está funcionando:

1. Acesse: https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions/process-orphan-cancellation-charges/logs
2. Verifique se não há erros
3. Confirme que as execuções estão ocorrendo semanalmente

### Logs Esperados

```
✅ Iniciando processamento de cobranças órfãs...
✅ Encontradas X classes órfãs
✅ Processando grupo: teacher_uuid + student_uuid
✅ Fatura criada com sucesso: invoice_uuid
✅ X classes marcadas como faturadas
✅ Processamento concluído
```

## Passo 4: Validar no Banco de Dados

Execute queries para confirmar o processamento:

### Verificar se há cobranças órfãs pendentes

```sql
SELECT 
  teacher_id,
  student_id,
  COUNT(*) as pending_charges,
  SUM(
    CASE 
      WHEN service_id IS NOT NULL THEN (SELECT price FROM class_services WHERE id = classes.service_id)
      ELSE 0
    END
  ) as total_amount
FROM classes
WHERE 
  status = 'cancelada'
  AND charge_applied = true
  AND billed = false
  AND cancelled_at < NOW() - INTERVAL '45 days'
GROUP BY teacher_id, student_id;
```

### Verificar faturas de cobranças órfãs criadas

```sql
SELECT 
  id,
  teacher_id,
  student_id,
  amount,
  created_at,
  status
FROM invoices
WHERE invoice_type = 'orphan_charges'
ORDER BY created_at DESC
LIMIT 10;
```

## Cronograma da Automação

- **Frequência**: Toda segunda-feira às 02:00 (horário do servidor)
- **Cron Expression**: `0 2 * * 1`
- **Timezone**: UTC

## Troubleshooting

### Erro: "RPC function not found"

A função RPC `create_invoice_and_mark_classes_billed` não está criada no banco de dados. Execute a migration necessária.

### Erro: "Teacher doesn't have financial module"

O professor precisa ter o módulo financeiro ativo na assinatura. As cobranças órfãs só são processadas para professores com acesso ao módulo financeiro.

### Erro: "No active cancellation policy"

O professor precisa ter uma política de cancelamento ativa. Se não houver, o sistema assume 50% de cobrança por padrão.

### Nenhuma cobrança órfã sendo processada

Verifique se:
1. Existem classes com `charge_applied: true` e `billed: false`
2. O `cancelled_at` é anterior a 45 dias atrás
3. O professor tem o módulo financeiro ativo
4. O professor tem `business_profile_id` configurado

## Monitoramento Recomendado

1. **Dashboard de métricas**:
   - Número de cobranças órfãs processadas por semana
   - Valor total faturado de cobranças órfãs
   - Taxa de erros no processamento

2. **Alertas**:
   - Alerta se houver mais de 10 cobranças órfãs acumuladas
   - Alerta se a função falhar 3 vezes consecutivas
   - Alerta se houver cobranças órfãs com mais de 90 dias

3. **Relatórios mensais**:
   - Resumo de cobranças órfãs recuperadas
   - Professores com maior número de cobranças órfãs
   - Análise de padrões de cancelamento

## Manutenção

### Desativar temporariamente

```sql
SELECT cron.unschedule('process-orphan-cancellation-charges');
```

### Reativar

Execute novamente `setup-orphan-charges-automation`.

### Alterar frequência

Edite o cron expression na função `setup-orphan-charges-automation` e execute-a novamente.

## Links Úteis

- [Logs da função órfã](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions/process-orphan-cancellation-charges/logs)
- [Logs do setup](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions/setup-orphan-charges-automation/logs)
- [Edge Functions Dashboard](https://supabase.com/dashboard/project/nwgomximjevgczwuyqcx/functions)
