import { Layout } from "@/components/Layout";
import { ClassServicesManager } from "@/components/ClassServicesManager";
import { MonthlySubscriptionsManager } from "@/components/MonthlySubscriptionsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";

export default function Servicos() {
  const { t } = useTranslation('monthlySubscriptions');

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4">
        <Tabs defaultValue="services">
          <TabsList className="mb-4">
            <TabsTrigger value="services">{t('tabs.services')}</TabsTrigger>
            <TabsTrigger value="subscriptions">{t('tabs.subscriptions')}</TabsTrigger>
          </TabsList>
          <TabsContent value="services">
            <ClassServicesManager />
          </TabsContent>
          <TabsContent value="subscriptions">
            <MonthlySubscriptionsManager />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
