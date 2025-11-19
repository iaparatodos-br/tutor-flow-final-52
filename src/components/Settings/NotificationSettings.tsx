import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface NotificationPreferences {
  material_shared: boolean;
  class_reminder: boolean;
  class_confirmed: boolean;
  class_cancelled: boolean;
  class_report_created: boolean;
  invoice_created: boolean;
  invoice_payment_reminder: boolean;
  invoice_paid: boolean;
  invoice_overdue: boolean;
}

const defaultPreferences: NotificationPreferences = {
  material_shared: true,
  class_reminder: true,
  class_confirmed: true,
  class_cancelled: true,
  class_report_created: true,
  invoice_created: true,
  invoice_payment_reminder: true,
  invoice_paid: true,
  invoice_overdue: true,
};

export function NotificationSettings() {
  const { t } = useTranslation('settings');
  const { profile } = useProfile();
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, [profile]);

  const loadPreferences = async () => {
    if (!profile?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', profile.id)
        .single();

      if (error) throw error;

      if (data?.notification_preferences) {
        const prefs = data.notification_preferences as Record<string, boolean>;
        setPreferences({ 
          ...defaultPreferences, 
          ...prefs 
        });
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
      toast.error(t('notifications.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    if (!profile?.id) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notification_preferences: preferences as unknown as Record<string, boolean> })
        .eq('id', profile.id);

      if (error) throw error;

      toast.success(t('notifications.success'));
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      toast.error(t('notifications.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const notificationTypes: Array<{ key: keyof NotificationPreferences; section: 'classes' | 'invoices' | 'materials' }> = [
    { key: 'class_reminder', section: 'classes' },
    { key: 'class_confirmed', section: 'classes' },
    { key: 'class_cancelled', section: 'classes' },
    { key: 'class_report_created', section: 'classes' },
    { key: 'invoice_created', section: 'invoices' },
    { key: 'invoice_payment_reminder', section: 'invoices' },
    { key: 'invoice_paid', section: 'invoices' },
    { key: 'invoice_overdue', section: 'invoices' },
    { key: 'material_shared', section: 'materials' },
  ];

  const groupedTypes = {
    classes: notificationTypes.filter(t => t.section === 'classes'),
    invoices: notificationTypes.filter(t => t.section === 'invoices'),
    materials: notificationTypes.filter(t => t.section === 'materials'),
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('notifications.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('notifications.description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('notifications.emailNotifications.title')}</CardTitle>
          <CardDescription>
            {t('notifications.emailNotifications.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seção: Aulas */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-foreground">{t('notifications.section_classes')}</h3>
            <div className="space-y-4">
              {groupedTypes.classes.map(({ key }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor={key}>{t(`notifications.types.${key}.label`)}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t(`notifications.types.${key}.description`)}
                    </p>
                  </div>
                  <Switch
                    id={key}
                    checked={preferences[key]}
                    onCheckedChange={() => handleToggle(key)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Seção: Faturas */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-foreground">{t('notifications.section_invoices')}</h3>
            <div className="space-y-4">
              {groupedTypes.invoices.map(({ key }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor={key}>{t(`notifications.types.${key}.label`)}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t(`notifications.types.${key}.description`)}
                    </p>
                  </div>
                  <Switch
                    id={key}
                    checked={preferences[key]}
                    onCheckedChange={() => handleToggle(key)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Seção: Materiais */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-foreground">{t('notifications.section_materials')}</h3>
            <div className="space-y-4">
              {groupedTypes.materials.map(({ key }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor={key}>{t(`notifications.types.${key}.label`)}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t(`notifications.types.${key}.description`)}
                    </p>
                  </div>
                  <Switch
                    id={key}
                    checked={preferences[key]}
                    onCheckedChange={() => handleToggle(key)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? t('notifications.saving') : t('notifications.save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
