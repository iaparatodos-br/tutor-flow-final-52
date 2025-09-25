import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Construction } from "lucide-react";

export function NotificationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Configurações de Notificação</h3>
        <p className="text-sm text-muted-foreground">
          Gerencie como e quando você recebe notificações sobre suas aulas e atividades.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-amber-500" />
            Em Desenvolvimento
          </CardTitle>
          <CardDescription>
            Esta funcionalidade está sendo desenvolvida
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Configurações de Notificação em Breve
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Estamos trabalhando para disponibilizar configurações personalizadas de notificação. 
                Em breve você poderá gerenciar todas as suas preferências de notificação aqui.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}