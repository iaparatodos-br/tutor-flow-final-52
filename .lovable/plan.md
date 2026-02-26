

# Diagnóstico: Aulas em grupo sendo duplicadas

## Causa raiz

No componente `Agenda.tsx` (linha 1860), a prop `loading` **não é passada** ao `ClassForm`:

```tsx
<ClassForm open={isDialogOpen} onOpenChange={setIsDialogOpen} onSubmit={handleClassSubmit} 
  students={students} dependents={dependents} services={services} existingClasses={classes} />
// ❌ Falta: loading={submitting}
```

Isso significa que o botão "Agendar Aula" dentro do `ClassForm` **nunca é desabilitado** durante o envio (linha 902 do ClassForm: `disabled={loading}` — mas `loading` é `undefined`).

Além disso, a função `handleClassSubmit` (linha 1410) **não tem guard contra reentrada**:
```tsx
const handleClassSubmit = async (formData: any) => {
    if (!profile?.id) return;
    setSubmitting(true); // ← Seta, mas não verifica se já está submitting
    ...
```

Resultado: ao clicar duas vezes rápido no botão, duas inserções são feitas no banco antes do dialog fechar.

## Correções

### 1. `src/pages/Agenda.tsx` — Passar prop `loading`
- Linha 1860: adicionar `loading={submitting}` ao `<ClassForm>`

### 2. `src/pages/Agenda.tsx` — Guard de reentrada
- Linha 1410-1411: adicionar `if (submitting) return;` antes do `setSubmitting(true)`

Ambas as correções são complementares: a prop desabilita o botão visualmente, e o guard impede chamadas programáticas duplicadas.

### Arquivos impactados
- `src/pages/Agenda.tsx` (2 linhas alteradas)

