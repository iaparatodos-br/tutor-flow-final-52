import { useState } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CancellationPolicySettings } from "@/components/Settings/CancellationPolicySettings";
import { ProfileSettings } from "@/components/Settings/ProfileSettings";
import { NotificationSettings } from "@/components/Settings/NotificationSettings";
import { Settings, User, Bell, Clock } from "lucide-react";

export default function Configuracoes() {
  const { isProfessor } = useProfile();

  if (!isProfessor) {
    return (
      <Layout>
        <div className="text-center py-8">
          <p>Acesso restrito a professores.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Configurações
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie suas preferências e configurações da conta
          </p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="cancellation" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Cancelamentos
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notificações
            </TabsTrigger>
          </TabsList>

          <div className="mt-8">
            <TabsContent value="profile" className="space-y-6">
              <ProfileSettings />
            </TabsContent>

            <TabsContent value="cancellation" className="space-y-6">
              <CancellationPolicySettings />
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <NotificationSettings />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}