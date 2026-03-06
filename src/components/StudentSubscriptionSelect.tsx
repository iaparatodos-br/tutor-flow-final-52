import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, UserPlus, CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { todayDateString, DEFAULT_TIMEZONE } from "@/utils/timezone";

interface AvailableStudent {
  relationship_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
}

interface StudentSubscriptionSelectProps {
  open: boolean;
  onClose: () => void;
  availableStudents: AvailableStudent[];
  isLoading: boolean;
  onAssign: (relationshipId: string, startsAt?: string) => Promise<void>;
  isAssigning: boolean;
}

export function StudentSubscriptionSelect({
  open,
  onClose,
  availableStudents,
  isLoading,
  onAssign,
  isAssigning
}: StudentSubscriptionSelectProps) {
  const { t } = useTranslation('monthlySubscriptions');
  const { profile } = useAuth();
  const userTimezone = profile?.timezone || DEFAULT_TIMEZONE;
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>(todayDateString(userTimezone));

  const handleAssign = async () => {
    if (!selectedRelationshipId) return;
    await onAssign(selectedRelationshipId, startsAt);
    setSelectedRelationshipId("");
    setStartsAt(todayDateString(userTimezone));
  };

  const handleClose = () => {
    setSelectedRelationshipId("");
    setStartsAt(todayDateString(userTimezone));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('assign.title')}
          </DialogTitle>
          <DialogDescription>
            {t('info.familyBilling')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Student Select */}
          <div className="space-y-2">
            <Label>{t('assign.selectStudent')}</Label>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                {t('assign.noAvailableStudents')}
              </p>
            ) : (
              <Select
                value={selectedRelationshipId}
                onValueChange={setSelectedRelationshipId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('assign.selectStudent')} />
                </SelectTrigger>
                <SelectContent>
                  {availableStudents.map((student) => (
                    <SelectItem 
                      key={student.relationship_id} 
                      value={student.relationship_id}
                    >
                      <div className="flex flex-col">
                        <span>{student.student_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {student.student_email}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Start Date */}
          {availableStudents.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                {t('assign.startsAt')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !startsAt && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-60" />
                    {startsAt
                      ? format(parse(startsAt, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM, yyyy", { locale: ptBR })
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startsAt ? parse(startsAt, 'yyyy-MM-dd', new Date()) : undefined}
                    onSelect={(date) => {
                      if (date) setStartsAt(format(date, 'yyyy-MM-dd'));
                    }}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                {t('assign.startsAtHelp')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isAssigning}
          >
            {t('actions.cancel')}
          </Button>
          <Button 
            onClick={handleAssign}
            disabled={!selectedRelationshipId || isAssigning}
          >
            {isAssigning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('actions.saving')}
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                {t('actions.assignStudent')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
