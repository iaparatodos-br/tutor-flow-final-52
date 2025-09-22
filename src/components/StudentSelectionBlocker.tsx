import React from 'react';
import { PlanDowngradeSelectionModal } from './PlanDowngradeSelectionModal';
import { PaymentFailureStudentSelectionModal } from './PaymentFailureStudentSelectionModal';
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
    <>
      {/* Payment Failure Student Selection Modal - Higher priority than regular selection */}
      {studentSelectionData.isPaymentFailure ? (
        <PaymentFailureStudentSelectionModal
          open={needsStudentSelection}
          onClose={handleComplete}
          students={studentSelectionData.students}
          currentPlan={studentSelectionData.currentPlan}
          newPlan={studentSelectionData.newPlan}
          currentCount={studentSelectionData.currentCount}
          targetLimit={studentSelectionData.targetLimit}
          needToRemove={studentSelectionData.needToRemove}
        />
      ) : (
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
      )}
    </>
  );
}