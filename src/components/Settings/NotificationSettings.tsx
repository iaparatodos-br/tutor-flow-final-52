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
  invoice_created: boolean;
}

const defaultPreferences: NotificationPreferences = {
  material_shared: true,
  class_reminder: true,
  class_confirmed: true,
  class_cancelled: true,
  invoice_created: true,
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

  const notificationTypes: Array<keyof NotificationPreferences> = [
    'material_shared',
    'class_reminder',
    'class_confirmed',
    'class_cancelled',
    'invoice_created'
  ];

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
          {notificationTypes.map((type) => (
            <div key={type} className="flex items-start justify-between space-x-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor={type} className="text-base font-medium">
                  {t(`notifications.types.${type}.label`)}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t(`notifications.types.${type}.description`)}
                </p>
              </div>
              <Switch
                id={type}
                checked={preferences[type]}
                onCheckedChange={() => handleToggle(type)}
              />
            </div>
          ))}

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
