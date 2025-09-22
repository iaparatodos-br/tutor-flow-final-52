# Implementação de Fuso Horário - Tutor Flow

## Resumo
O sistema **Tutor Flow** opera exclusivamente no **Horário de Brasília (UTC-3)** para garantir consistência e simplicidade no gerenciamento de horários entre professores e alunos.

## Padronização Implementada

### 1. Utilitários de Timezone
- **Arquivo**: `src/utils/timezone.ts`
- **Funções principais**:
  - `formatTimeBrazil()` - Formata horários no fuso de Brasília
  - `formatDateBrazil()` - Formata datas no fuso de Brasília
  - `formatDateTimeBrazil()` - Formata data/hora completa
  - `isPastInBrazil()` - Verifica se data está no passado
  - `TIMEZONE_LABEL` - Constante com o label padrão

### 2. Labels Informativos Adicionados

#### Componentes com Labels de Fuso Horário:
- ✅ **StudentScheduleRequest** - Solicitação de aulas
- ✅ **ClassForm** - Formulário de criação de aulas
- ✅ **AvailabilityManager** - Gerenciamento de disponibilidade
- ✅ **ClassReportModal** - Modal de relatório de aulas
- ✅ **CalendarView** - Visualização do calendário
- ✅ **SimpleCalendar** - Calendário simplificado
- ✅ **CancellationModal** - Modal de cancelamento
- ✅ **ArchivedDataViewer** - Visualizador de dados arquivados

#### Localizações (i18n):
- **Português**: `src/i18n/locales/pt/common.json`
- **Inglês**: `src/i18n/locales/en/common.json`

```json
"timezone": {
  "label": "Horário de Brasília",
  "info": "Todos os horários são exibidos no fuso horário de Brasília (UTC-3)"
}
```

### 3. Componente de Informação
- **Arquivo**: `src/components/TimezoneInfo.tsx`
- **Variantes**:
  - `info` - Alert completo com ícone
  - `subtle` - Texto discreto

## Locais com Indicação de Fuso Horário

### Interface do Professor:
- Configuração de horários de trabalho
- Agendamento de aulas
- Visualização do calendário
- Relatórios de aulas

### Interface do Aluno:
- Solicitação de aulas
- Visualização de horários disponíveis
- Confirmação de agendamentos

### Dados Arquivados:
- Timestamps de arquivamento
- Datas de aulas arquivadas

## Benefícios da Implementação

1. **Consistência**: Todos os usuários veem os mesmos horários
2. **Simplicidade**: Evita confusões de conversão de fuso
3. **Clareza**: Usuários sabem exatamente qual fuso está sendo usado
4. **Manutenibilidade**: Fácil de expandir para múltiplos fusos no futuro

## Considerações Futuras

Se houver necessidade de suporte a múltiplos fusos horários:

1. Adicionar campo `timezone` na tabela `profiles`
2. Usar as funções do `src/utils/timezone.ts` como base
3. Implementar conversões automáticas baseadas no perfil do usuário
4. Manter labels informativos sobre o fuso de origem dos dados

## Notas Técnicas

- Datas são armazenadas em UTC no banco de dados
- Conversões são feitas na camada de apresentação
- Sistema mantém compatibilidade com moment.js existente
- Labels são traduzidos via sistema i18n