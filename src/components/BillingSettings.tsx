import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Mail, User, Calendar } from "lucide-react";

interface BillingSettingsProps {
  studentId?: string;
  isModal?: boolean;
}

export function BillingSettings({ studentId, isModal = false }: BillingSettingsProps) {
  const { profile, isProfessor } = useProfile();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    guardian_name: '',
    guardian_email: '',
    guardian_phone: '',
    billing_day: 15
  });

  useEffect(() => {
    if ((studentId || profile?.id)) {
      loadBillingSettings();
    }
  }, [studentId, profile?.id]);

  const loadBillingSettings = async () => {
    setLoading(true);
    try {
      const targetId = studentId || profile?.id;
      const { data, error } = await supabase
        .from('profiles')
        .select('guardian_name, guardian_email, guardian_phone, billing_day')
        .eq('id', targetId)
        .single();

      if (error) throw error;

      setSettings({
        guardian_name: data?.guardian_name || '',
        guardian_email: data?.guardian_email || '',
        guardian_phone: data?.guardian_phone || '',
        billing_day: data?.billing_day || 15
      });
    } catch (error) {
      console.error('Error loading billing settings:', error);
      toast({
        title: "Erro ao carregar configurações",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const targetId = studentId || profile?.id;
      const { error } = await supabase
        .from('profiles')
        .update({
          guardian_name: settings.guardian_name || null,
          guardian_email: settings.guardian_email || null,
          guardian_phone: settings.guardian_phone || null,
          billing_day: settings.billing_day
        })
        .eq('id', targetId);

      if (error) throw error;

      toast({
        title: "Configurações salvas",
        description: "As configurações de cobrança foram atualizadas",
      });
    } catch (error: any) {
      console.error('Error saving billing settings:', error);
      toast({
        title: "Erro ao salvar configurações",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className={!isModal ? "shadow-card" : ""}>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando configurações...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={!isModal ? "shadow-card" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {isProfessor && !studentId ? "Configurações de Cobrança" : "Dados para Cobrança"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Guardian Information */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Informações do Responsável</Label>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="guardian_name">Nome do Responsável</Label>
              <Input
                id="guardian_name"
                type="text"
                value={settings.guardian_name}
                onChange={(e) => setSettings(prev => ({ ...prev, guardian_name: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            
            <div>
              <Label htmlFor="guardian_phone">Telefone do Responsável</Label>
              <Input
                id="guardian_phone"
                type="tel"
                value={settings.guardian_phone}
                onChange={(e) => setSettings(prev => ({ ...prev, guardian_phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="guardian_email">Email do Responsável</Label>
            <Input
              id="guardian_email"
              type="email"
              value={settings.guardian_email}
              onChange={(e) => setSettings(prev => ({ ...prev, guardian_email: e.target.value }))}
              placeholder="email@exemplo.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              As faturas serão enviadas para este email
            </p>
          </div>
        </div>

        {/* Billing Day (only for professors or if no student specified) */}
        {(isProfessor && !studentId) && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Configurações de Cobrança</Label>
            </div>
            
            <div>
              <Label htmlFor="billing_day">Dia da Cobrança Mensal</Label>
              <Input
                id="billing_day"
                type="number"
                min="1"
                max="28"
                value={settings.billing_day}
                onChange={(e) => setSettings(prev => ({ ...prev, billing_day: parseInt(e.target.value) }))}
                placeholder="15"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Dia do mês em que as mensalidades serão geradas automaticamente (1-28)
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}