import { Layout } from "@/components/Layout";
import { ClassServicesManager } from "@/components/ClassServicesManager";

export default function Servicos() {
  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4">
        <ClassServicesManager />
      </div>
    </Layout>
  );
}