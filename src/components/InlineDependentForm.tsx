import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Baby, CalendarIcon, Plus, Trash2, X, AlertTriangle } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export interface InlineDependent {
  id: string;
  name: string;
  birth_date?: string;
}

interface InlineDependentFormProps {
  dependents: InlineDependent[];
  onDependentsChange: (dependents: InlineDependent[]) => void;
  disabled?: boolean;
  /** Maximum number of dependents allowed (undefined = unlimited) */
  maxAllowed?: number;
  /** Current plan slug to show appropriate messages */
  currentPlanSlug?: string;
}

export function InlineDependentForm({
  dependents,
  onDependentsChange,
  disabled = false,
  maxAllowed,
  currentPlanSlug,
}: InlineDependentFormProps) {
  const { t } = useTranslation('students');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBirthDate, setNewBirthDate] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;

    const newDependent: InlineDependent = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      birth_date: newBirthDate || undefined,
    };

    onDependentsChange([...dependents, newDependent]);
    setNewName("");
    setNewBirthDate("");
    setShowAddForm(false);
  };

  const handleRemove = (id: string) => {
    onDependentsChange(dependents.filter((d) => d.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const isFreePlan = currentPlanSlug === 'free';
  const hasReachedLimit = maxAllowed !== undefined && maxAllowed <= 0;
  const canAddMore = maxAllowed === undefined || maxAllowed > 0;

  return (
    <div className="space-y-3">
      {/* Plan limit warning for free plan */}
      {hasReachedLimit && isFreePlan && (
        <Alert className="border-destructive bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-destructive">
            {t('registrationType.family.limitReached', 'Limite do plano gratuito atingido. Faça upgrade para adicionar mais dependentes.')}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Baby className="h-4 w-4 text-muted-foreground" />
          {t('registrationType.family.dependentsLabel', 'Dependentes')}
          {dependents.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({dependents.length})
            </span>
          )}
          {/* Show remaining slots badge */}
          {maxAllowed !== undefined && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              maxAllowed <= 0 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-primary/10 text-primary'
            }`}>
              {maxAllowed > 0 
                ? t('registrationType.family.slotsRemaining', '{{count}} vaga(s)', { count: maxAllowed })
                : t('registrationType.family.noSlots', 'Sem vagas')
              }
            </span>
          )}
        </Label>
        {!showAddForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
            disabled={disabled || !canAddMore}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('registrationType.family.addDependent', 'Adicionar')}
          </Button>
        )}
      </div>

      {/* List of added dependents */}
      {dependents.length > 0 && (
        <div className="space-y-2">
          {dependents.map((dep) => (
            <div
              key={dep.id}
              className="flex items-center justify-between p-3 rounded-md bg-muted/50 border"
            >
              <div className="flex items-center gap-3">
                <Baby className="h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium text-sm">{dep.name}</p>
                  {dep.birth_date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {format(parse(dep.birth_date, 'yyyy-MM-dd', new Date()), "dd/MM/yyyy")}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleRemove(dep.id)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Inline add form */}
      {showAddForm && (
        <div className="p-3 rounded-md border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t('registrationType.family.newDependent', 'Novo Dependente')}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setShowAddForm(false);
                setNewName("");
                setNewBirthDate("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

            <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-dep-name" className="text-xs">
                {t('dependents.fields.name', 'Nome')} *
              </Label>
              <Input
                id="new-dep-name"
                type="text"
                placeholder={t('dependents.placeholders.name', 'Nome completo')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {t('dependents.fields.birthDate', 'Data de Nascimento')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !newBirthDate && "text-muted-foreground"
                    )}
                    disabled={disabled}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                    {newBirthDate
                      ? format(parse(newBirthDate, 'yyyy-MM-dd', new Date()), "dd/MM/yyyy")
                      : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newBirthDate ? parse(newBirthDate, 'yyyy-MM-dd', new Date()) : undefined}
                    onSelect={(date) => {
                      if (date) setNewBirthDate(format(date, 'yyyy-MM-dd'));
                    }}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setNewName("");
                setNewBirthDate("");
              }}
            >
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!newName.trim() || disabled}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('dependents.add', 'Adicionar')}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {dependents.length === 0 && !showAddForm && (
        <div className="p-4 rounded-md border border-dashed text-center">
          <Baby className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {hasReachedLimit && isFreePlan
              ? t('registrationType.family.cannotAddDueToLimit', 'Limite do plano atingido')
              : t('registrationType.family.noDependentsYet', 'Nenhum dependente adicionado')
            }
          </p>
          {canAddMore && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setShowAddForm(true)}
              disabled={disabled}
            >
              {t('registrationType.family.addFirst', 'Adicionar primeiro dependente')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
