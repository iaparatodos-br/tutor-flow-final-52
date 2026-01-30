

# Plano: Atualizar Frequência do Cron Job do Inbox para 1x/hora

## Objetivo
Atualizar o documento `docs/teacher-inbox-implementation.md` para alterar a frequência do cron job da Edge Function `generate-teacher-notifications` de **1x/dia (06:00 UTC)** para **1x/hora**.

---

## Locais a Atualizar

### 1. Descrição da Edge Function (linha ~710)

**De:**
```
Esta função roda via cron job 1x/dia (06:00 UTC) e:
```

**Para:**
```
Esta função roda via cron job **a cada hora** (minuto 0 de cada hora) e:
```

---

### 2. SQL do Cron Job (linhas 1018-1041)

**De:**
```sql
-- Remover job existente (se houver)
SELECT cron.unschedule('generate-teacher-notifications-daily');

-- Criar cron job para rodar às 06:00 UTC (03:00 BRT)
SELECT cron.schedule(
  'generate-teacher-notifications-daily',
  '0 6 * * *',  -- Cron expression: todo dia às 06:00 UTC
  ...
);

-- Verificar se o job foi criado
SELECT jobid, jobname, schedule, command 
FROM cron.job 
WHERE jobname = 'generate-teacher-notifications-daily';
```

**Para:**
```sql
-- Remover job existente (se houver)
SELECT cron.unschedule('generate-teacher-notifications-hourly');

-- Criar cron job para rodar a cada hora (minuto 0)
SELECT cron.schedule(
  'generate-teacher-notifications-hourly',
  '0 * * * *',  -- Cron expression: a cada hora no minuto 0
  ...
);

-- Verificar se o job foi criado
SELECT jobid, jobname, schedule, command 
FROM cron.job 
WHERE jobname = 'generate-teacher-notifications-hourly';
```

---

### 3. Seção de Cleanup (linha ~2362)

**De:**
```
- O cleanup roda junto com a varredura diária (06:00 UTC)
```

**Para:**
```
- O cleanup roda junto com cada varredura horária (a cada hora)
```

---

### 4. Checklist Fase 1 (linha ~2396 e ~2666)

**De:**
```
- [ ] Configurar cron job via pg_cron (06:00 UTC)
```

**Para:**
```
- [ ] Configurar cron job via pg_cron (a cada hora - '0 * * * *')
```

---

### 5. Atualizar Justificativa Técnica (nova seção ou comentário)

Adicionar nota explicativa sobre a escolha da frequência horária:

```markdown
> **Frequência Horária:** A execução a cada hora garante que notificações 
> de aulas pendentes e faturas vencidas apareçam no inbox do professor 
> com atraso máximo de 1 hora. O custo é desprezível (~720 chamadas/mês 
> vs 2M limite do plano Pro).
```

---

## Impacto Técnico

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Frequência | 1x/dia | 24x/dia |
| Cron Expression | `0 6 * * *` | `0 * * * *` |
| Nome do Job | `generate-teacher-notifications-daily` | `generate-teacher-notifications-hourly` |
| Chamadas/mês | ~30 | ~720 |
| Latência máxima | 24 horas | 1 hora |

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `docs/teacher-inbox-implementation.md` | Atualizar frequência, SQL e checklists |

---

## Benefícios da Frequência Horária

1. **Resposta rápida:** Aulas marcadas/canceladas aparecem no inbox em até 1 hora
2. **Faturas vencidas:** Notificação aparece na mesma hora em que vence
3. **Custo mínimo:** 720 chamadas/mês = 0.036% do limite gratuito (2M)
4. **Consistência:** Mesmo padrão do `send-class-reminders-hourly` já existente

