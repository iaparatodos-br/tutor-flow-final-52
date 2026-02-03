
# Plano: Corrigir Geração de Notificações de Anistia (Individual + Grupo)

## Problema Identificado

O sistema de notificações de anistia falha em dois cenários diferentes:

| Cenário | Descrição | Problema |
|---------|-----------|----------|
| **Aula Individual** | Aluno cancela tarde → aula inteira cancelada | `process-cancellation` não grava `charge_applied` em `classes` |
| **Aula em Grupo** | Aluno sai tarde → apenas participante cancelado | `generate-teacher-notifications` não consulta `class_participants` |

## Solução em Duas Partes

### Parte 1: Corrigir `process-cancellation` (Cenário 2)

Adicionar `charge_applied: shouldCharge` na atualização da tabela `classes` quando há cancelamento completo.

```text
Arquivo: supabase/functions/process-cancellation/index.ts
Linha: ~325-333

ANTES:
┌─────────────────────────────────────────┐
│ .update({                               │
│   status: 'cancelada',                  │
│   cancelled_at: now.toISOString(),      │
│   cancelled_by: cancelled_by,           │
│   cancellation_reason: reason           │
│ })                                      │
└─────────────────────────────────────────┘

DEPOIS:
┌─────────────────────────────────────────┐
│ .update({                               │
│   status: 'cancelada',                  │
│   cancelled_at: now.toISOString(),      │
│   cancelled_by: cancelled_by,           │
│   cancellation_reason: reason,          │
│   charge_applied: shouldCharge  ← NOVO  │
│ })                                      │
└─────────────────────────────────────────┘
```

### Parte 2: Corrigir `generate-teacher-notifications` (Cenário 1)

Adicionar busca em `class_participants` para capturar alunos que saíram de aulas em grupo com cobrança.

```text
Arquivo: supabase/functions/generate-teacher-notifications/index.ts

ADICIONAR nova query:
┌──────────────────────────────────────────────────────────────────┐
│ // CATEGORY 2B: amnesty_eligible (from class_participants)      │
│ // Para alunos que saíram de aulas em grupo                     │
│                                                                  │
│ SELECT DISTINCT cp.class_id, c.teacher_id                       │
│ FROM class_participants cp                                       │
│ JOIN classes c ON c.id = cp.class_id                            │
│ WHERE cp.status = 'cancelada'                                   │
│   AND cp.charge_applied = true                                  │
│   AND c.amnesty_granted = false                                 │
│   AND c.class_date >= (now - 30 days)                           │
│   AND c.status != 'cancelada'  -- Aula ainda ativa (grupo)      │
└──────────────────────────────────────────────────────────────────┘
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/process-cancellation/index.ts` | Adicionar `charge_applied: shouldCharge` na linha 331 |
| `supabase/functions/generate-teacher-notifications/index.ts` | Adicionar query para `class_participants` cancelados em aulas em grupo |

## Fluxo Atualizado

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        CANCELAMENTO COM COBRANÇA                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   AULA INDIVIDUAL                       AULA EM GRUPO                   │
│   ────────────────                      ──────────────                  │
│                                                                         │
│   ┌───────────────────┐                 ┌───────────────────┐           │
│   │ process-cancellation               │ process-cancellation           │
│   │ Cenário 2                          │ Cenário 1                      │
│   └─────────┬─────────┘                └─────────┬─────────┘           │
│             │                                    │                      │
│             ▼                                    ▼                      │
│   ┌───────────────────┐                 ┌───────────────────┐           │
│   │ UPDATE classes    │                 │ UPDATE class_     │           │
│   │ charge_applied=T  │                 │ participants      │           │
│   └─────────┬─────────┘                 │ charge_applied=T  │           │
│             │                           └─────────┬─────────┘           │
│             │                                     │                     │
│             └──────────────┬──────────────────────┘                     │
│                            │                                            │
│                            ▼                                            │
│             ┌─────────────────────────────────┐                         │
│             │ generate-teacher-notifications  │                         │
│             │                                 │                         │
│             │ 1. Busca em classes             │                         │
│             │    charge_applied = true        │                         │
│             │                                 │                         │
│             │ 2. Busca em class_participants  │ ← NOVO                  │
│             │    charge_applied = true        │                         │
│             │    + aula ainda ativa           │                         │
│             └───────────────┬─────────────────┘                         │
│                             │                                           │
│                             ▼                                           │
│              ┌──────────────────────────────┐                           │
│              │  Notificação "amnesty_eligible"                          │
│              │  aparece no Inbox do professor                           │
│              └──────────────────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Detalhes Técnicos

### Modificação 1: `process-cancellation/index.ts`

Localização: Cenário 2 (linha ~325-333)

```typescript
// ANTES
await supabaseClient
  .from('classes')
  .update({
    status: 'cancelada',
    cancelled_at: now.toISOString(),
    cancelled_by: cancelled_by,
    cancellation_reason: reason
  })
  .eq('id', class_id);

// DEPOIS
await supabaseClient
  .from('classes')
  .update({
    status: 'cancelada',
    cancelled_at: now.toISOString(),
    cancelled_by: cancelled_by,
    cancellation_reason: reason,
    charge_applied: shouldCharge  // ADICIONADO
  })
  .eq('id', class_id);
```

### Modificação 2: `generate-teacher-notifications/index.ts`

Adicionar após a query de amnesty existente (linha ~85):

```typescript
// CATEGORY 2B: amnesty_eligible from class_participants
// Para alunos que saíram de aulas em grupo com cobrança
const { data: amnestyFromParticipants, error: amnestyPartError } = await supabase
  .from('class_participants')
  .select(`
    class_id,
    classes!inner (
      id,
      teacher_id,
      status,
      amnesty_granted,
      class_date
    )
  `)
  .eq('status', 'cancelada')
  .eq('charge_applied', true)
  .neq('classes.status', 'cancelada')  // Aula ainda ativa (grupo)
  .eq('classes.amnesty_granted', false)
  .gte('classes.class_date', thirtyDaysAgoISO);

if (amnestyPartError) {
  console.error('[generate-teacher-notifications] Error fetching amnesty from participants:', amnestyPartError);
} else if (amnestyFromParticipants) {
  console.log(`[generate-teacher-notifications] Found ${amnestyFromParticipants.length} amnesty eligible from participants`);
  
  // Deduplicar com os já encontrados
  const existingClassIds = new Set(amnestyEligible?.map(c => c.id) || []);
  
  for (const cp of amnestyFromParticipants) {
    if (!existingClassIds.has(cp.class_id)) {
      notifications.push({
        teacher_id: cp.classes.teacher_id,
        source_type: 'class',
        source_id: cp.class_id,
        category: 'amnesty_eligible',
      });
      existingClassIds.add(cp.class_id);
    }
  }
}
```

## Consideração sobre Amnesty Button

O `AmnestyButton` atual concede anistia na tabela `classes` (campo `amnesty_granted`). Para aulas em grupo onde apenas um participante saiu, precisaremos decidir:

**Opção A (Simples)**: Anistia se aplica à aula inteira - qualquer participante que saiu com cobrança pode receber anistia pelo professor

**Opção B (Granular)**: Criar campo `amnesty_granted` em `class_participants` para anistia individual

Recomendo **Opção A** para manter simplicidade inicial, já que o professor pode decidir dar anistia ao participante que saiu.

## Resultado Esperado

Após estas correções:

1. **Aula individual cancelada tarde** → `classes.charge_applied = true` → notificação aparece
2. **Aluno sai de aula em grupo tarde** → `class_participants.charge_applied = true` → notificação aparece
3. Professor vê "Anistia Disponível" no Inbox para ambos os casos
4. Deep-link leva ao calendário no mês correto (já implementado)

## Sequência de Implementação

1. Modificar `process-cancellation/index.ts` (1 linha)
2. Modificar `generate-teacher-notifications/index.ts` (nova query)
3. Deploy das Edge Functions
4. Executar `generate-teacher-notifications` manualmente
5. Verificar que notificações de anistia aparecem
