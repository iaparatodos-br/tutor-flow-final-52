import { Layout } from "@/components/Layout";
import { ClassServicesManager } from "@/components/ClassServicesManager";
import { MonthlySubscriptionsManager } from "@/components/MonthlySubscriptionsManager";
import { BillingSettings } from "@/components/Settings/BillingSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";


export default function Servicos() {
  const { t } = useTranslation(['monthlySubscriptions', 'services']);

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4">
        <Tabs defaultValue="services">
          <TabsList className="mb-4">
            <TabsTrigger value="services">{t('monthlySubscriptions:tabs.services')}</TabsTrigger>
            <TabsTrigger value="subscriptions">{t('monthlySubscriptions:tabs.subscriptions')}</TabsTrigger>
            <TabsTrigger value="settings">{t('monthlySubscriptions:tabs.settings')}</TabsTrigger>
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
