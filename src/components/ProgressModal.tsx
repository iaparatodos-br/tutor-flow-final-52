import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  description?: string;
}

interface ProgressModalProps {
  open: boolean;
  title: string;
  steps: ProgressStep[];
  currentStep?: string;
  progress: number;
  onClose?: () => void;
  allowClose?: boolean;
}

export function ProgressModal({
  open,
  title,
  steps,
  currentStep,
  progress,
  onClose,
  allowClose = false
}: ProgressModalProps) {
  const { t } = useTranslation();

  const getStepIcon = (step: ProgressStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'in-progress':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={allowClose ? onClose : undefined}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('common.progress')}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>

          {/* Steps List */}
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-start space-x-3 p-3 rounded-lg transition-colors ${
                  step.status === 'in-progress' 
                    ? 'bg-blue-50 dark:bg-blue-950/20' 
                    : step.status === 'completed'
                    ? 'bg-green-50 dark:bg-green-950/20'
                    : step.status === 'error'
                    ? 'bg-red-50 dark:bg-red-950/20'
                    : 'bg-muted/30'
                }`}
              >
                {getStepIcon(step)}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className={`text-sm font-medium ${
                      step.status === 'in-progress' ? 'text-blue-700 dark:text-blue-300' :
                      step.status === 'completed' ? 'text-green-700 dark:text-green-300' :
                      step.status === 'error' ? 'text-red-700 dark:text-red-300' :
                      'text-muted-foreground'
                    }`}>
                      {step.label}
                    </h4>
                    {step.status === 'in-progress' && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        {t('common.processing')}...
                      </span>
                    )}
                  </div>
                  {step.description && (
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Current Step Info */}
          {currentStep && (
            <div className="text-center text-sm text-muted-foreground">
              {t('common.currentStep')}: {currentStep}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}