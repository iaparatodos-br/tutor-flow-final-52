import { useSubscription } from "@/contexts/SubscriptionContext";
import { PendingBoletoModal } from "./PendingBoletoModal";

export function PendingBoletoGuard() {
  const { 
    pendingBoletoDetected, 
    pendingBoletoData, 
    dismissPendingBoleto,
    refreshSubscription 
  } = useSubscription();

  const handleRefresh = async () => {
    await refreshSubscription();
  };

  if (!pendingBoletoDetected) {
    return null;
  }

  return (
    <PendingBoletoModal
      open={pendingBoletoDetected}
      onDismiss={dismissPendingBoleto}
      boletoData={pendingBoletoData}
      onRefresh={handleRefresh}
    />
  );
}
