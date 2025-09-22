import React from 'react';
import { PaymentFailureModal } from './PaymentFailureModal';
import { useSubscription } from '@/contexts/SubscriptionContext';

export function PaymentFailureGuard() {
  const { 
    paymentFailureDetected, 
    paymentFailureData, 
    handlePaymentFailure 
  } = useSubscription();

  if (!paymentFailureDetected || !paymentFailureData) {
    return null;
  }

  const handleRenewSubscription = () => {
    handlePaymentFailure('renew');
  };

  const handleDowngradeToFree = () => {
    handlePaymentFailure('downgrade');
  };

  return (
    <PaymentFailureModal
      open={paymentFailureDetected}
      onRenewSubscription={handleRenewSubscription}
      onDowngradeToFree={handleDowngradeToFree}
      failureDetails={paymentFailureData}
    />
  );
}