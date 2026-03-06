import { useProfile } from "@/contexts/ProfileContext";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CancellationPolicySettings } from "@/components/Settings/CancellationPolicySettings";
import { ProfileSettings } from "@/components/Settings/ProfileSettings";
import { NotificationSettings } from "@/components/Settings/NotificationSettings";
import { PreferencesSettings } from "@/components/Settings/PreferencesSettings";
import { CookieSettings } from "@/components/Settings/CookieSettings";
import { Settings, User, Bell, FileText, Palette, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Configuracoes() {
  const { isProfessor } = useProfile();
  const { t } = useTranslation('settings');

  const showCancellationTab = isProfessor;
  
  const getGridClass = () => {
    if (!isProfessor) return 'grid-cols-4';
    return showCancellationTab ? 'grid-cols-5' : 'grid-cols-4';
  };

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-2 sm:px-4">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('subtitle')}
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
            {showCancellationTab && (
              <TabsTrigger value="cancellation" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('tabs.cancellation')}
              </TabsTrigger>
            )}
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {t('tabs.notifications')}
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t('tabs.privacy')}
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

            {showCancellationTab && (
              <TabsContent value="cancellation" className="space-y-6">
                <CancellationPolicySettings />
              </TabsContent>
            )}

            <TabsContent value="privacy" className="space-y-6">
              <CookieSettings />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}