import { useProfile } from "@/contexts/ProfileContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CancellationPolicySettings } from "@/components/Settings/CancellationPolicySettings";
import { ProfileSettings } from "@/components/Settings/ProfileSettings";
import { NotificationSettings } from "@/components/Settings/NotificationSettings";
import { PreferencesSettings } from "@/components/Settings/PreferencesSettings";
import { Settings, User, Bell, Clock, Palette } from "lucide-react";
import { BillingSettings } from "@/components/Settings/BillingSettings";
import { useTranslation } from "react-i18next";

export default function Configuracoes() {
  const { isProfessor } = useProfile();
  const { hasFeature } = useSubscription();
  const { t } = useTranslation('settings');

  // Determine which tabs to show based on user type and features
  const showBillingTab = isProfessor && hasFeature('financial_module');
  const showCancellationTab = isProfessor;
  
  // Use explicit grid classes that Tailwind can detect
  const getGridClass = () => {
    if (!isProfessor) return 'grid-cols-3';
    return showBillingTab ? 'grid-cols-5' : 'grid-cols-4';
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie suas preferências e configurações da conta
          </p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className={`grid w-full ${getGridClass()}`}>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {t('tabs.profile')}
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {t('tabs.preferences')}
            </TabsTrigger>
            {showBillingTab && (
              <TabsTrigger value="billing" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Cobrança
              </TabsTrigger>
            )}
            {showCancellationTab && (
              <TabsTrigger value="cancellation" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t('tabs.cancellation')}
              </TabsTrigger>
            )}
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {t('tabs.notifications')}
            </TabsTrigger>
          </TabsList>

          <div className="mt-8">
            <TabsContent value="profile" className="space-y-6">
              <ProfileSettings />
            </TabsContent>

            <TabsContent value="preferences" className="space-y-6">
              <PreferencesSettings />
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <NotificationSettings />
            </TabsContent>

            {showBillingTab && (
              <TabsContent value="billing" className="space-y-6">
                <BillingSettings />
              </TabsContent>
            )}

            {showCancellationTab && (
              <TabsContent value="cancellation" className="space-y-6">
                <CancellationPolicySettings />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}