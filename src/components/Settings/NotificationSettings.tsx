import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bell, Mail, MessageSquare, Calendar } from "lucide-react";

export function NotificationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    email_notifications: true,
    sms_notifications: false,
    push_notifications: true,
    class_reminders: true,
    payment_notifications: true,
    cancellation_notifications: true,
    new_student_notifications: true,
    marketing_emails: false
  });

  const handleSave = async () => {
    setLoading(true);
    
    // Simular salvamento - implementar com Supabase posteriormente
    setTimeout(() => {
      toast({
        title: "Sucesso",
        description: "Preferências de notificação salvas com sucesso.",
      });
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações por Email
          </CardTitle>
          <CardDescription>
            Configure quando receber notificações por email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email_notifications">Email Geral</Label>
              <p className="text-sm text-muted-foreground">
                Receber notificações importantes por email
              </p>
            </div>
            <Switch
              id="email_notifications"
              checked={settings.email_notifications}
              onCheckedChange={(checked) => 
                setSettings({...settings, email_notifications: checked})
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="class_reminders">Lembretes de Aula</Label>
              <p className="text-sm text-muted-foreground">
                Receber lembretes antes das aulas
              </p>
            </div>
            <Switch
              id="class_reminders"
              checked={settings.class_reminders}
              onCheckedChange={(checked) => 
                setSettings({...settings, class_reminders: checked})
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="payment_notifications">Notificações de Pagamento</Label>
              <p className="text-sm text-muted-foreground">
                Receber confirmações de pagamentos
              </p>
            </div>
            <Switch
              id="payment_notifications"
              checked={settings.payment_notifications}
              onCheckedChange={(checked) => 
                setSettings({...settings, payment_notifications: checked})
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="cancellation_notifications">Cancelamentos</Label>
              <p className="text-sm text-muted-foreground">
                Notificar sobre cancelamentos de aula
              </p>
            </div>
            <Switch
              id="cancellation_notifications"
              checked={settings.cancellation_notifications}
              onCheckedChange={(checked) => 
                setSettings({...settings, cancellation_notifications: checked})
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="new_student_notifications">Novos Alunos</Label>
              <p className="text-sm text-muted-foreground">
                Notificar quando um novo aluno se inscrever
              </p>
            </div>
            <Switch
              id="new_student_notifications"
              checked={settings.new_student_notifications}
              onCheckedChange={(checked) => 
                setSettings({...settings, new_student_notifications: checked})
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Outras Notificações
          </CardTitle>
          <CardDescription>
            Configure outras formas de comunicação
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sms_notifications">SMS</Label>
              <p className="text-sm text-muted-foreground">
                Receber notificações urgentes por SMS
              </p>
            </div>
            <Switch
              id="sms_notifications"
              checked={settings.sms_notifications}
              onCheckedChange={(checked) => 
                setSettings({...settings, sms_notifications: checked})
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="push_notifications">Notificações Push</Label>
              <p className="text-sm text-muted-foreground">
                Receber notificações no navegador
              </p>
            </div>
            <Switch
              id="push_notifications"
              checked={settings.push_notifications}
              onCheckedChange={(checked) => 
                setSettings({...settings, push_notifications: checked})
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="marketing_emails">Emails Promocionais</Label>
              <p className="text-sm text-muted-foreground">
                Receber dicas e novidades do TutorFlow
              </p>
            </div>
            <Switch
              id="marketing_emails"
              checked={settings.marketing_emails}
              onCheckedChange={(checked) => 
                setSettings({...settings, marketing_emails: checked})
              }
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? "Salvando..." : "Salvar Preferências"}
      </Button>
    </div>
  );
}