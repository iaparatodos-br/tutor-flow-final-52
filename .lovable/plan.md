
# Padronizar Seletores de Data e Hora em Todo o Sistema

## Resumo
Substituir todos os inputs nativos `type="date"` e `type="time"` pelos componentes customizados (Popover+Calendar e TimePicker) que ja funcionam no modal de agendar aula.

## Componentes a Alterar

### Campos de HORA (`type="time"` -> `TimePicker`)

| Arquivo | Campo(s) | Contexto |
|---------|----------|----------|
| `ClassExceptionForm.tsx` | Novo Horario | Modal de modificar aula recorrente |
| `FutureClassExceptionForm.tsx` | Novo Horario | Modal de excecao futura |
| `AvailabilityManager.tsx` | Start Time, End Time (dialog de bloqueio) | Cadastro de bloqueio de horario |
| `AvailabilityManager.tsx` | De, Ate (linha de dia da semana) | Config de disponibilidade semanal |

### Campos de DATA (`type="date"` -> Popover + Calendar ptBR)

| Arquivo | Campo(s) | Contexto |
|---------|----------|----------|
| `ClassExceptionForm.tsx` | Nova Data | Modal de modificar aula |
| `FutureClassExceptionForm.tsx` | Nova Data, Data limite | Modal de excecao futura |
| `AvailabilityManager.tsx` | Data inicio, Data fim (dialog de bloqueio) | Cadastro de bloqueio |
| `ExpenseModal.tsx` | Data da despesa | Modal de despesa |
| `CreateInvoiceModal.tsx` | Data de vencimento | Modal de fatura |
| `StudentSubscriptionSelect.tsx` | Data de inicio | Selecao de assinatura |
| `ClassForm.tsx` | Data fim recorrencia | Formulario de aula (recorrencia) |
| `DependentFormModal.tsx` | Data de nascimento | Modal de dependente |
| `InlineDependentForm.tsx` | Data de nascimento | Formulario inline de dependente |

## Padrao a Seguir

### Para datas (copiando o padrao do ClassForm):
```tsx
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !value && "text-muted-foreground")}>
      <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
      {value ? format(parse(value, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM, yyyy", { locale: ptBR }) : "Selecione a data"}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align="start">
    <Calendar mode="single" selected={...} onSelect={...} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
  </PopoverContent>
</Popover>
```

### Para horas:
```tsx
import { TimePicker } from "@/components/ui/time-picker";

<TimePicker value={value} onChange={onChange} />
```

## Detalhes Tecnicos

- Todos os componentes ja usam formato `yyyy-MM-dd` para datas e `HH:mm` para horas internamente, entao a interface de dados nao muda
- Os imports de `date-fns` e `date-fns/locale` serao adicionados onde necessario
- O import de `Input` sera mantido nos arquivos que ainda o usam para outros campos
- O `TimePicker` na linha de disponibilidade semanal (`AvailabilityManager` day row) usara `className="w-24"` para manter o layout compacto
- Nenhuma logica de negocio sera alterada, apenas a camada de apresentacao

## Arquivos Impactados (9 arquivos)

1. `src/components/ClassExceptionForm.tsx` - data + hora
2. `src/components/FutureClassExceptionForm.tsx` - 2 datas + hora
3. `src/components/Availability/AvailabilityManager.tsx` - 2 datas + 4 horas
4. `src/components/ExpenseModal.tsx` - data
5. `src/components/CreateInvoiceModal.tsx` - data
6. `src/components/StudentSubscriptionSelect.tsx` - data
7. `src/components/ClassForm/ClassForm.tsx` - data (recurrence end_date)
8. `src/components/DependentFormModal.tsx` - data
9. `src/components/InlineDependentForm.tsx` - data
