import { Layout } from "@/components/Layout";
import { PaymentAccountsManager } from "@/components/PaymentAccountsManager";

export default function ContasRecebimento() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <PaymentAccountsManager />
      </div>
    </Layout>
  );
}