import { useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
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
  const { t } = useTranslation('settings');

  // Determine which tabs to show based on user type
  const showProfessorTabs = isProfessor;
  const tabCount = showProfessorTabs ? 5 : 3;

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
          <TabsList className={`grid w-full grid-cols-${tabCount}`}>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              {t('tabs.profile')}
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {t('tabs.preferences')}
            </TabsTrigger>
            {showProfessorTabs && (
              <TabsTrigger value="billing" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Cobrança
              </TabsTrigger>
            )}
            {showProfessorTabs && (
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

            {showProfessorTabs && (
              <TabsContent value="billing" className="space-y-6">
                <BillingSettings />
              </TabsContent>
            )}

            {showProfessorTabs && (
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