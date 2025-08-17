import { Layout } from "@/components/Layout";
import { ClassServicesManager } from "@/components/ClassServicesManager";

export default function Servicos() {
  return (
    <Layout>
      <div className="container mx-auto p-6">
        <ClassServicesManager />
      </div>
    </Layout>
  );
}