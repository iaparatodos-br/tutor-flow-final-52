import React from 'react';
import { PlanDowngradeSelectionModal } from './PlanDowngradeSelectionModal';
import { useSubscription } from '@/contexts/SubscriptionContext';

export function StudentSelectionBlocker() {
  const { 
    needsStudentSelection, 
    studentSelectionData, 
    completeStudentSelection 
  } = useSubscription();

  if (!needsStudentSelection || !studentSelectionData) {
    return null;
  }

  const handleComplete = (completed?: boolean) => {
    if (completed) {
      completeStudentSelection();
    }
  };

  return (
    <PlanDowngradeSelectionModal
      open={needsStudentSelection}
      onClose={handleComplete}
      students={studentSelectionData.students}
      currentPlan={studentSelectionData.currentPlan}
      newPlan={studentSelectionData.newPlan}
      currentCount={studentSelectionData.currentCount}
      targetLimit={studentSelectionData.targetLimit}
      needToRemove={studentSelectionData.needToRemove}
    />
  );
}