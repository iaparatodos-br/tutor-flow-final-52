

# Fix: Dependente desaparece apos materializar aula virtual

## Problema

Quando uma aula virtual de um dependente e materializada (ao marcar como concluida ou cadastrar relatorio), o `dependent_id` nao e incluido no INSERT de `class_participants`. O participante e criado apenas com o `student_id` (o responsavel), fazendo com que o sistema exiba o responsavel no lugar do dependente.

## Causa raiz

Ha **3 pontos** no codigo que criam participantes durante a materializacao, e **nenhum deles** inclui o campo `dependent_id`:

### 1. `src/pages/Agenda.tsx` - Aula em grupo (linha 1324)

```typescript
// ANTES:
const participantInserts = virtualClass.participants.map(p => ({
  class_id: newClass.id,
  student_id: p.student_id,
  status: targetStatus
}));

// DEPOIS:
const participantInserts = virtualClass.participants.map(p => ({
  class_id: newClass.id,
  student_id: p.student_id,
  dependent_id: (p as any).dependent_id || null,
  status: targetStatus
}));
```

### 2. `src/pages/Agenda.tsx` - Aula individual (linha 1337)

```typescript
// ANTES:
.insert({
  class_id: newClass.id,
  student_id: virtualClass.participants[0].student_id,
  status: targetStatus,
  ...
});

// DEPOIS:
.insert({
  class_id: newClass.id,
  student_id: virtualClass.participants[0].student_id,
  dependent_id: (virtualClass.participants[0] as any).dependent_id || null,
  status: targetStatus,
  ...
});
```

### 3. `src/components/ClassReportModal.tsx` - Materializacao via relatorio (linha 195)

```typescript
// ANTES:
const participantInserts = classData.participants.map((p: any) => ({
  class_id: newClass.id,
  student_id: p.student_id,
  status: targetStatus,
  ...
}));

// DEPOIS:
const participantInserts = classData.participants.map((p: any) => ({
  class_id: newClass.id,
  student_id: p.student_id,
  dependent_id: p.dependent_id || null,
  status: targetStatus,
  ...
}));
```

## Arquivos impactados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Agenda.tsx` | Adicionar `dependent_id` nos 2 inserts de participantes na materializacao |
| `src/components/ClassReportModal.tsx` | Adicionar `dependent_id` no insert de participantes na materializacao |

## Resultado esperado

Apos a correcao, ao materializar uma aula virtual de um dependente, o `dependent_id` sera preservado no registro de `class_participants`, mantendo a exibicao correta do nome do dependente no calendario e em todos os outros pontos do sistema.
