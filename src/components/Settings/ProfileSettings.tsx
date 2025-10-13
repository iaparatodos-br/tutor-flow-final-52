import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Phone, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ProfileSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('settings');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: ''
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        email: profile.email || ''
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setLoading(true);
    
    setTimeout(() => {
      toast({
        title: t('profile.title'),
        description: t('profile.infoMessage'),
      });
      setLoading(false);
    }, 500);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('profile.title')}
          </CardTitle>
          <CardDescription>
            {t('profile.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('profile.email')}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              {t('profile.emailDescription')}
            </p>
          </div>
          
          <p className="text-sm text-muted-foreground">
            {t('profile.otherInfo')}
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {t('profile.viewProfile')}
      </Button>
    </div>
  );
}