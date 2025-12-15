import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type StudentRegistrationType = "individual" | "family" | null;

interface StudentTypeSelectorProps {
  selectedType: StudentRegistrationType;
  onSelect: (type: StudentRegistrationType) => void;
  disabled?: boolean;
}

export function StudentTypeSelector({
  selectedType,
  onSelect,
  disabled = false,
}: StudentTypeSelectorProps) {
  const { t } = useTranslation('students');

  const options = [
    {
      type: "individual" as const,
      icon: User,
      title: t('registrationType.individual.title', 'Aluno com Email'),
      description: t('registrationType.individual.description', 'Aluno adulto ou com email próprio para acesso ao sistema'),
    },
    {
      type: "family" as const,
      icon: Users,
      title: t('registrationType.family.title', 'Família / Menores'),
      description: t('registrationType.family.description', 'Responsável com um ou mais dependentes menores de idade'),
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = selectedType === option.type;

        return (
          <Card
            key={option.type}
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50",
              isSelected && "border-primary ring-2 ring-primary/20",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !disabled && onSelect(option.type)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-full",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{option.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{option.description}</CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
