import { Layout } from "@/components/Layout";
import { ClassServicesManager } from "@/components/ClassServicesManager";
import { MonthlySubscriptionsManager } from "@/components/MonthlySubscriptionsManager";
import { BillingSettings } from "@/components/Settings/BillingSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

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
            <div className="bg-gradient-to-br from-primary/5 to-transparent rounded-xl border border-primary/10 p-4 sm:p-5 mb-6 flex gap-3 items-start">
              <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('services:infoBanner')}
              </p>
            </div>
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
