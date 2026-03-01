
## Corrigir valor de cobranca R$ 0 no modal de cancelamento (visao do aluno)

### Problema
Quando um aluno abre o modal de cancelamento, o valor de cobranca aparece como R$ 0,00. Isso acontece porque:

1. A funcao `loadServices` (linha 1169) busca servicos com `.eq('teacher_id', profile.id)` -- mas `profile.id` eh o ID do **aluno**, nao do professor
2. O array `services` fica vazio para alunos
3. Na funcao `handleRecurringClassCancel` (linha 1757), `services.find(s => s.id === classToCancel.service_id)?.price` retorna `undefined`, caindo para `0`
4. O `CancellationModal` recebe `service_price: 0` via `virtualClassData`

### Solucao
Corrigir a construcao do `classDataForModal` em `handleRecurringClassCancel` para buscar o preco do servico diretamente do banco quando o array `services` estiver vazio (caso do aluno).

### Alteracoes

**1. `src/pages/Agenda.tsx` -- funcao `handleRecurringClassCancel`**
- Tornar a funcao `async`
- Quando `services` estiver vazio e houver `service_id`, buscar o preco do servico diretamente via query ao `class_services`
- Usar o preco retornado no `classDataForModal.service_price`

Logica:
```text
// Antes (linha 1757-1759):
service_price: classToCancel.service_id
  ? services.find(s => s.id === classToCancel.service_id)?.price || 0
  : 0,

// Depois:
// Se services esta vazio (aluno), buscar preco diretamente
let servicePrice = 0;
if (classToCancel.service_id) {
  const cached = services.find(s => s.id === classToCancel.service_id);
  if (cached) {
    servicePrice = cached.price;
  } else {
    // Fetch direto -- RLS permite via policy "Students can view services for their classes"
    const { data } = await supabase
      .from('class_services')
      .select('price')
      .eq('id', classToCancel.service_id)
      .maybeSingle();
    servicePrice = data?.price || 0;
  }
}
```

**Nota sobre RLS:** A tabela `class_services` ja possui uma policy `"Students can view services for their classes"` que permite ao aluno ler servicos vinculados as suas aulas, entao o fetch direto funciona para aulas materializadas. Para aulas virtuais (template), o aluno pode nao ter acesso direto via essa policy. Nesse caso, a alternativa eh usar o `CancellationModal` que ja faz fallback via `business_profiles` e busca o preco internamente.

**Alternativa mais robusta (preferida):** Caso a RLS bloqueie o acesso para templates virtuais, podemos tambem enriquecer o `CancellationModal` para buscar o preco do servico via a edge function `get-teacher-availability` que o aluno ja tem acesso, ou simplesmente fazer o fetch do preco no proprio modal quando `service_price` vier como 0 e houver `service_id`.

**2. `src/components/CancellationModal.tsx` -- fallback de seguranca**
- No bloco de virtual class (linhas 98-124), quando `service_price` for 0 e `service_id` existir, fazer um fetch direto do preco como fallback adicional
