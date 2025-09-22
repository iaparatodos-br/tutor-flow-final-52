import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionText?: string;
  cancelText?: string;
  variant?: "default" | "destructive" | "warning" | "info";
  onConfirm: () => void;
  loading?: boolean;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  actionText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
  onConfirm,
  loading = false,
}: ConfirmationDialogProps) {
  const getIcon = () => {
    switch (variant) {
      case "destructive":
        return <XCircle className="h-6 w-6 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
      case "info":
        return <Info className="h-6 w-6 text-blue-600" />;
      default:
        return <CheckCircle className="h-6 w-6 text-green-600" />;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            {getIcon()}
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className={
              variant === "destructive"
                ? "bg-destructive hover:bg-destructive/90"
                : ""
            }
          >
            {loading ? "Processando..." : actionText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}