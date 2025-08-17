import { Layout } from "@/components/Layout";
import { ClassServicesManager } from "@/components/ClassServicesManager";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

export default function Servicos() {
  const { isProfessor } = useAuth();

  if (!isProfessor) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <ClassServicesManager />
      </div>
    </Layout>
  );
}