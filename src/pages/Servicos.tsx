import { Layout } from "@/components/Layout";
import { ClassServicesManager } from "@/components/ClassServicesManager";
import { MonthlySubscriptionsManager } from "@/components/MonthlySubscriptionsManager";
import { BillingSettings } from "@/components/Settings/BillingSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";

export default function Servicos() {
  const { t } = useTranslation('monthlySubscriptions');

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Serviços</h1>
          <p className="text-muted-foreground mt-2">
            Serviços são os tipos de aulas ou atendimentos que você oferece. Aqui você define o nome (ex: Aula Particular de Inglês), a duração padrão e o valor. Ao criar seus serviços, você agiliza a criação da agenda para facilitar o seu cotidiano.
          </p>
        </div>
        <Tabs defaultValue="services">
          <TabsList className="mb-4">
            <TabsTrigger value="services">{t('tabs.services')}</TabsTrigger>
            <TabsTrigger value="subscriptions">{t('tabs.subscriptions')}</TabsTrigger>
            <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger>
          </TabsList>
          <TabsContent value="services">
            <ClassServicesManager />
          </TabsContent>
          <TabsContent value="subscriptions">
            <MonthlySubscriptionsManager />
          </TabsContent>
          <TabsContent value="settings">
            <BillingSettings />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
