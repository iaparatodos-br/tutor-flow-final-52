import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { User, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

const TIMEZONE_OPTIONS = [
{ value: "America/Sao_Paulo", label: "América/São Paulo (BRT)" },
{ value: "America/Manaus", label: "América/Manaus (AMT)" },
{ value: "America/Belem", label: "América/Belém (BRT)" },
{ value: "America/Fortaleza", label: "América/Fortaleza (BRT)" },
{ value: "America/Recife", label: "América/Recife (BRT)" },
{ value: "America/Cuiaba", label: "América/Cuiabá (AMT)" },
{ value: "America/Porto_Velho", label: "América/Porto Velho (AMT)" },
{ value: "America/Rio_Branco", label: "América/Rio Branco (ACT)" },
{ value: "America/Noronha", label: "América/Noronha (FNT)" },
{ value: "America/New_York", label: "América/Nova York (ET)" },
{ value: "America/Chicago", label: "América/Chicago (CT)" },
{ value: "America/Denver", label: "América/Denver (MT)" },
{ value: "America/Los_Angeles", label: "América/Los Angeles (PT)" },
{ value: "America/Argentina/Buenos_Aires", label: "América/Buenos Aires (ART)" },
{ value: "America/Santiago", label: "América/Santiago (CLT)" },
{ value: "America/Bogota", label: "América/Bogotá (COT)" },
{ value: "America/Lima", label: "América/Lima (PET)" },
{ value: "America/Mexico_City", label: "América/Cidade do México (CST)" },
{ value: "Europe/Lisbon", label: "Europa/Lisboa (WET)" },
{ value: "Europe/London", label: "Europa/Londres (GMT)" },
{ value: "Europe/Paris", label: "Europa/Paris (CET)" },
{ value: "Europe/Berlin", label: "Europa/Berlim (CET)" },
{ value: "Europe/Madrid", label: "Europa/Madrid (CET)" },
{ value: "Europe/Rome", label: "Europa/Roma (CET)" },
{ value: "Asia/Tokyo", label: "Ásia/Tóquio (JST)" },
{ value: "Asia/Shanghai", label: "Ásia/Xangai (CST)" },
{ value: "Asia/Dubai", label: "Ásia/Dubai (GST)" },
{ value: "Australia/Sydney", label: "Austrália/Sydney (AEST)" },
{ value: "Pacific/Auckland", label: "Pacífico/Auckland (NZST)" },
{ value: "Africa/Johannesburg", label: "África/Joanesburgo (SAST)" }];


export function ProfileSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('settings');
  const [loading, setLoading] = useState(false);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [formData, setFormData] = useState({
    email: ''
  });
  const [selectedTimezone, setSelectedTimezone] = useState('America/Sao_Paulo');

  useEffect(() => {
    if (profile) {
      setFormData({
        email: profile.email || ''
      });
      setSelectedTimezone(profile.timezone || 'America/Sao_Paulo');
    }
  }, [profile]);

  const handleSave = async () => {
    setLoading(true);
    setTimeout(() => {
      toast({
        title: t('profile.title'),
        description: t('profile.infoMessage')
      });
      setLoading(false);
    }, 500);
  };

  const handleTimezoneChange = async (newTimezone: string) => {
    if (!profile?.id || newTimezone === selectedTimezone) return;

    setSavingTimezone(true);
    try {
      const { error } = await supabase.
      from('profiles').
      update({ timezone: newTimezone }).
      eq('id', profile.id);

      if (error) throw error;

      // Clear session storage so useTimezoneSync doesn't suppress future checks
      sessionStorage.removeItem('tz-sync-dismissed');

      toast({
        title: t('profile.title'),
        description: `Fuso horário atualizado para ${TIMEZONE_OPTIONS.find((tz) => tz.value === newTimezone)?.label || newTimezone}`
      });

      // Reload para limpar cache do AuthContext e reinicializar todos os componentes
      // com o novo timezone (mesma abordagem do botão "Atualizar" no useTimezoneSync)
      window.location.reload();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar o fuso horário.";
      console.error('Erro ao atualizar timezone:', error);
      toast({
        title: "Erro",
        description: message,
        variant: "destructive"
      });
      setSavingTimezone(false);
    }
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
              className="bg-muted" />
            
            <p className="text-xs text-muted-foreground">
              {t('profile.emailDescription')}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('profile.otherInfo')}
          </p>
        </CardContent>
      </Card>

      {/* Timezone Selector - Escape Hatch */}
      

































      

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {t('profile.viewProfile')}
      </Button>
    </div>);

}