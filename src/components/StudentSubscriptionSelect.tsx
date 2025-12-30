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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Loader2, UserPlus, Calendar } from "lucide-react";
import { format } from "date-fns";

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
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const handleAssign = async () => {
    if (!selectedRelationshipId) return;
    await onAssign(selectedRelationshipId, startsAt);
    setSelectedRelationshipId("");
    setStartsAt(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleClose = () => {
    setSelectedRelationshipId("");
    setStartsAt(format(new Date(), 'yyyy-MM-dd'));
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
                <Calendar className="h-4 w-4" />
                {t('assign.startsAt')}
              </Label>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
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
