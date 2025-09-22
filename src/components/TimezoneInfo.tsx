import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";

interface TimezoneInfoProps {
  className?: string;
  variant?: "info" | "subtle";
}

export function TimezoneInfo({ className = "", variant = "info" }: TimezoneInfoProps) {
  const { t } = useTranslation('common');
  
  if (variant === "subtle") {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        {t('timezone.info')}
      </p>
    );
  }
  
  return (
    <Alert className={className}>
      <Info className="h-4 w-4" />
      <AlertDescription>
        {t('timezone.info')}
      </AlertDescription>
    </Alert>
  );
}