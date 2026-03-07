import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Package, UserMinus, UserPlus, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import { MonthlySubscriptionCard } from "./MonthlySubscriptionCard";
import { MonthlySubscriptionModal } from "./MonthlySubscriptionModal";
import { StudentSubscriptionSelect } from "./StudentSubscriptionSelect";

import {
  useMonthlySubscriptions,
  useSubscriptionStudents,
  useAvailableStudentsForSubscription,
  useCreateMonthlySubscription,
  useUpdateMonthlySubscription,
  useToggleMonthlySubscription,
  useBulkAssignStudents,
  useRemoveStudentFromSubscription
} from "@/hooks/useMonthlySubscriptions";

import type { MonthlySubscriptionWithCount, AssignedStudent } from "@/types/monthly-subscriptions";
import type { MonthlySubscriptionFormSchema } from "@/schemas/monthly-subscription.schema";

export function MonthlySubscriptionsManager() {
  const { t } = useTranslation('monthlySubscriptions');
  const [showInactive, setShowInactive] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<MonthlySubscriptionWithCount | null>(null);
  const [viewingSubscription, setViewingSubscription] = useState<MonthlySubscriptionWithCount | null>(null);
  const [assigningToSubscription, setAssigningToSubscription] = useState<MonthlySubscriptionWithCount | null>(null);
  
  const [removeStudentConfirm, setRemoveStudentConfirm] = useState<{subscriptionId: string, studentSubscriptionId: string, studentName: string} | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = useState<MonthlySubscriptionFormSchema | null>(null);

  // Queries
  const { data: subscriptions, isLoading } = useMonthlySubscriptions(showInactive);
  const { data: assignedStudents, isLoading: isLoadingStudents } = useSubscriptionStudents(viewingSubscription?.id || null);
  const { data: rawAvailableStudents, isLoading: isLoadingAvailable } = useAvailableStudentsForSubscription(assigningToSubscription?.id || null);

  // Filter out students already assigned to this subscription (UI-level defense)
  const assignedRelIds = new Set((assignedStudents || []).map((s: AssignedStudent) => s.relationship_id));
  const availableStudents = (rawAvailableStudents || []).filter(s => !s.has_active_subscription && !assignedRelIds.has(s.relationship_id));

  // Mutations
  const createMutation = useCreateMonthlySubscription();
  const updateMutation = useUpdateMonthlySubscription();
  const toggleMutation = useToggleMonthlySubscription();
  const bulkAssignMutation = useBulkAssignStudents();
  const removeMutation = useRemoveStudentFromSubscription();

  const handleOpenCreate = () => {
    setEditingSubscription(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (subscription: MonthlySubscriptionWithCount) => {
    setEditingSubscription(subscription);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSubscription(null);
  };

  const executeUpdate = async (data: MonthlySubscriptionFormSchema) => {
    if (!editingSubscription) return;
    await updateMutation.mutateAsync({
      id: editingSubscription.id,
      formData: {
        name: data.name,
        description: data.description || "",
        price: data.price,
        is_active: data.is_active,
        selectedStudents: []
      }
    });
    handleCloseModal();
  };

  const handleSubmit = async (data: MonthlySubscriptionFormSchema) => {
    if (editingSubscription) {
      // Check if deactivating a subscription with linked students
      const isDeactivating = editingSubscription.is_active && data.is_active === false;
      if (isDeactivating && editingSubscription.students_count > 0) {
        setPendingDeactivation(data);
        return;
      }
      await executeUpdate(data);
    } else {
      await createMutation.mutateAsync({
        name: data.name,
        description: data.description || "",
        price: data.price,
        selectedStudents: []
      });
      handleCloseModal();
    }
  };

  const confirmDeactivation = async () => {
    if (pendingDeactivation) {
      await executeUpdate(pendingDeactivation);
      setPendingDeactivation(null);
    }
  };



  const handleViewStudents = (subscription: MonthlySubscriptionWithCount) => {
    setViewingSubscription(subscription);
  };

  const handleOpenAssign = () => {
    if (viewingSubscription) {
      setAssigningToSubscription(viewingSubscription);
    }
  };

  const handleAssignStudent = async (relationshipIds: string[], startsAt?: string) => {
    if (!assigningToSubscription) return;
    await bulkAssignMutation.mutateAsync({
      subscriptionId: assigningToSubscription.id,
      toAdd: relationshipIds,
      toRemove: [],
      startsAt
    });
    setAssigningToSubscription(null);
  };

  const handleRemoveStudent = (studentSubscriptionId: string, studentName: string) => {
    if (!viewingSubscription) return;
    setRemoveStudentConfirm({
      subscriptionId: viewingSubscription.id,
      studentSubscriptionId,
      studentName
    });
  };

  const confirmRemoveStudent = () => {
    if (removeStudentConfirm) {
      removeMutation.mutate({
        assignmentId: removeStudentConfirm.studentSubscriptionId
      });
      setRemoveStudentConfirm(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const filteredSubscriptions = subscriptions || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground">
            {t('info.billingDay')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t('list.inactive')}
          </label>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('new')}
          </Button>
        </div>
      </div>

      {/* Subscriptions List */}
      {filteredSubscriptions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('list.noSubscriptions')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('list.noSubscriptionsDescription')}
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t('new')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredSubscriptions.map((subscription) => (
            <MonthlySubscriptionCard
              key={subscription.id}
              subscription={subscription}
              onEdit={handleOpenEdit}
              onViewStudents={handleViewStudents}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <MonthlySubscriptionModal
        open={isModalOpen}
        onClose={handleCloseModal}
        subscription={editingSubscription}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* View Students Dialog */}
      <Dialog open={!!viewingSubscription} onOpenChange={(open) => !open && setViewingSubscription(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingSubscription?.name}
              <Badge variant="secondary">
                {formatPrice(viewingSubscription?.price || 0)}/mês
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {t('list.studentsCount', { count: assignedStudents?.length || 0 })}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 max-h-[60vh] overflow-y-auto">
            {isLoadingStudents ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !assignedStudents || assignedStudents.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                {t('list.noStudents')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Início</TableHead>
                    
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedStudents.map((student) => (
                    <TableRow key={student.student_subscription_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{student.student_name}</p>
                          <p className="text-sm text-muted-foreground">{student.student_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(student.starts_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveStudent(student.student_subscription_id, student.student_name)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleOpenAssign}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t('actions.assignStudent')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Student Dialog */}
      <StudentSubscriptionSelect
        open={!!assigningToSubscription}
        onClose={() => setAssigningToSubscription(null)}
        availableStudents={(availableStudents || []).filter(s => !s.has_active_subscription)}
        isLoading={isLoadingAvailable}
        onAssign={handleAssignStudent}
        isAssigning={bulkAssignMutation.isPending}
      />

      {/* Remove Student Confirmation */}
      <AlertDialog open={!!removeStudentConfirm} onOpenChange={(open) => !open && setRemoveStudentConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm.removeStudent')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm.removeStudentDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveStudent}>
              {t('actions.removeStudent')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivation Confirmation */}
      <AlertDialog open={!!pendingDeactivation} onOpenChange={(open) => !open && setPendingDeactivation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm.deactivate')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirm.deactivateDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivation}>
              {t('actions.deactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
