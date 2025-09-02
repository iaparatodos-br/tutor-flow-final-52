import { Layout } from "@/components/Layout";
import { PaymentAccountsManager } from "@/components/PaymentAccountsManager";
import { FeatureGate } from "@/components/FeatureGate";

export default function ContasRecebimento() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <FeatureGate feature="payment_accounts" showUpgrade={true}>
          <PaymentAccountsManager />
        </FeatureGate>
      </div>
    </Layout>
  );
}