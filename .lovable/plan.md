

## Plano: Conflitos de Horario - Warning ao inves de Bloqueio + Icone no Calendario

### Resumo

Tres alteracoes principais:
1. **ClassForm**: Mudar conflito de bloqueio (erro vermelho) para aviso (warning amarelo), permitindo submissao
2. **ClassForm**: Incluir aulas virtuais de recorrencia (ate 2 meses) na verificacao de conflitos
3. **SimpleCalendar + MobileCalendarList**: Exibir icone de exclamacao amarelo nos dias com conflitos de horario

---

### 1. ClassForm - Warning ao inves de Bloqueio

**Arquivo**: `src/components/ClassForm/ClassForm.tsx`

- Renomear `timeConflict` de erro de validacao para um estado separado `timeConflictWarning` (boolean) que NAO bloqueia a submissao
- Remover `timeConflict` do objeto `validationErrors` (para que `Object.values(errors).some(Boolean)` nao bloqueie)
- Criar um estado `const [timeConflictWarning, setTimeConflictWarning] = useState(false)`
- Manter a mesma logica de deteccao de conflitos, mas setar `setTimeConflictWarning(true)` ao inves de `errors.timeConflict = true`
- Trocar a mensagem de erro vermelha por um `Alert` amarelo com variante `warning`
- Atualizar estilos dos campos de data/hora para borda amarela (ao inves de vermelha) quando houver conflito

### 2. ClassForm - Verificar Conflitos em Aulas Virtuais de Recorrencia

**Arquivo**: `src/components/ClassForm/ClassForm.tsx`

- As `existingClasses` ja incluem aulas materializadas e templates. Precisamos gerar virtuais a partir dos templates para verificar conflitos
- Na logica de `handleSubmit`, antes de verificar conflitos, gerar instancias virtuais dos templates presentes em `existingClasses` (que possuem `recurrence_pattern`) ate 2 meses a partir da data do template
- Usar a mesma logica de RRULE usada em `Agenda.tsx` (`generateVirtualInstances`) para calcular as datas
- Incluir essas instancias virtuais na lista de aulas verificadas para conflito
- Tambem verificar conflitos quando a nova aula for recorrente: gerar as datas futuras da recorrencia (ate 2 meses) e verificar cada uma contra as aulas existentes + virtuais

### 3. Icone de Conflito no Calendario

**Arquivo**: `src/components/Calendar/SimpleCalendar.tsx`

- Criar um `useMemo` que calcula quais dias tem conflitos (2+ aulas ativas com horarios sobrepostos no mesmo dia)
- Na celula do dia (grid do calendario), ao lado do numero do dia, renderizar um icone `AlertTriangle` com fundo amarelo quando houver conflito
- Envolver o icone em um `Tooltip` (ja importado no projeto) com a mensagem de conflito
- Logica de deteccao: para cada dia, verificar se algum par de aulas (nao canceladas/concluidas) tem sobreposicao de horario

**Arquivo**: `src/components/Calendar/MobileCalendarList.tsx`

- Aplicar a mesma logica de deteccao de conflitos para a versao mobile
- Exibir o icone de aviso amarelo nos itens de dia que possuem conflitos

### 4. Traducoes i18n

**Arquivos**: `src/i18n/locales/pt/classes.json` e `src/i18n/locales/en/classes.json`

- Alterar `timeConflictError` para `timeConflictWarning` com texto: "Ja existe uma aula agendada neste horario. Voce pode continuar mesmo assim."
- Adicionar chave `calendar.timeConflict`: "Existem aulas com horarios conflitantes neste dia"

---

### Detalhes Tecnicos

**Deteccao de conflitos no calendario (SimpleCalendar)**:
```text
Para cada dia com 2+ aulas ativas:
  Para cada par (aulaA, aulaB):
    Se aulaA.start < aulaB.end E aulaA.end > aulaB.start:
      marcar dia como conflitante
```

**Geracao de virtuais para verificacao no ClassForm**:
- Filtrar `existingClasses` onde `is_template === true` e `recurrence_pattern` existe
- Para cada template, gerar ocorrencias usando RRULE ate `min(recurrence_end_date, template_date + 2 meses)`
- Concatenar com `existingClasses` normais para a verificacao de conflito

**Verificacao de conflitos para novas recorrencias**:
- Quando o professor marca recorrencia no formulario, gerar as datas futuras (ate 2 meses) da nova aula
- Verificar cada data gerada contra todas as aulas existentes + virtuais
- Se qualquer data tiver conflito, exibir o warning amarelo listando quantos conflitos foram encontrados

