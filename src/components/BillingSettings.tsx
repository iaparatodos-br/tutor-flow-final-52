import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Mail, User, Calendar, MapPin } from "lucide-react";
import { validateCPF, formatCPF, formatCEP } from '@/utils/validation';

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
    billing_day: 15,
    cpf: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_postal_code: ''
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

      // Guardian data is now ONLY in teacher_student_relationships
      if (isProfessor && studentId) {
        // Teacher editing a student: get from relationship
        const { data: rel, error: relError } = await supabase
          .from('teacher_student_relationships')
          .select('student_guardian_name, student_guardian_email, student_guardian_phone, billing_day')
          .eq('teacher_id', profile?.id)
          .eq('student_id', studentId)
          .single();

        if (relError) throw relError;

        // Student's own CPF and address are still in profiles
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('cpf, address_street, address_city, address_state, address_postal_code')
          .eq('id', studentId)
          .single();

        if (profileError) throw profileError;

        setSettings({
          guardian_name: rel?.student_guardian_name || '',
          guardian_email: rel?.student_guardian_email || '',
          guardian_phone: rel?.student_guardian_phone || '',
          billing_day: rel?.billing_day || 15,
          cpf: profileData?.cpf || '',
          address_street: profileData?.address_street || '',
          address_city: profileData?.address_city || '',
          address_state: profileData?.address_state || '',
          address_postal_code: profileData?.address_postal_code || ''
        });
      } else if (profile?.role === 'aluno') {
        // Student viewing own data: get first teacher relationship
        const { data: rel, error: relError } = await supabase
          .from('teacher_student_relationships')
          .select('student_guardian_name, student_guardian_email, student_guardian_phone, billing_day')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (relError) throw relError;

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('cpf, address_street, address_city, address_state, address_postal_code')
          .eq('id', profile.id)
          .single();

        if (profileError) throw profileError;

        setSettings({
          guardian_name: rel?.student_guardian_name || '',
          guardian_email: rel?.student_guardian_email || '',
          guardian_phone: rel?.student_guardian_phone || '',
          billing_day: rel?.billing_day || 15,
          cpf: profileData?.cpf || '',
          address_street: profileData?.address_street || '',
          address_city: profileData?.address_city || '',
          address_state: profileData?.address_state || '',
          address_postal_code: profileData?.address_postal_code || ''
        });
      }
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

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;
    
    if (field === 'cpf') {
      formattedValue = formatCPF(value);
    } else if (field === 'address_postal_code') {
      formattedValue = formatCEP(value);
    }
    
    setSettings(prev => ({
      ...prev,
      [field]: formattedValue
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const targetId = studentId || profile?.id;
      
      // Update CPF and address in profiles (student's own data)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          cpf: settings.cpf.replace(/\D/g, '') || null,
          address_street: settings.address_street || null,
          address_city: settings.address_city || null,
          address_state: settings.address_state || null,
          address_postal_code: settings.address_postal_code.replace(/\D/g, '') || null,
          address_complete: !!(settings.cpf && settings.address_street && settings.address_city && settings.address_state && settings.address_postal_code),
        })
        .eq('id', targetId);

      if (profileError) throw profileError;

      // Update guardian and billing day in relationship
      if (isProfessor && studentId) {
        const { error: relError } = await supabase
          .from('teacher_student_relationships')
          .update({ 
            student_guardian_name: settings.guardian_name || null,
            student_guardian_email: settings.guardian_email || null,
            student_guardian_phone: settings.guardian_phone || null,
            billing_day: settings.billing_day 
          })
          .eq('teacher_id', profile?.id)
          .eq('student_id', studentId);
        
        if (relError) throw relError;
      } else if (profile?.role === 'aluno') {
        // Student updating own guardian data: update first teacher relationship
        const { data: rel } = await supabase
          .from('teacher_student_relationships')
          .select('id')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (rel) {
          const { error: relError } = await supabase
            .from('teacher_student_relationships')
            .update({ 
              student_guardian_name: settings.guardian_name || null,
              student_guardian_email: settings.guardian_email || null,
              student_guardian_phone: settings.guardian_phone || null,
              billing_day: settings.billing_day 
            })
            .eq('id', rel.id);
          
          if (relError) throw relError;
        }
      }

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
                onChange={(e) => handleInputChange('guardian_name', e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            
            <div>
              <Label htmlFor="guardian_phone">Telefone do Responsável</Label>
              <Input
                id="guardian_phone"
                type="tel"
                value={settings.guardian_phone}
                onChange={(e) => handleInputChange('guardian_phone', e.target.value)}
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
              onChange={(e) => handleInputChange('guardian_email', e.target.value)}
              placeholder="email@exemplo.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              As faturas serão enviadas para este email
            </p>
          </div>
        </div>

        {/* CPF and Address Information */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Informações para Pagamento</Label>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                type="text"
                value={settings.cpf}
                onChange={(e) => handleInputChange('cpf', e.target.value)}
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>
            
            <div>
              <Label htmlFor="address_postal_code">CEP</Label>
              <Input
                id="address_postal_code"
                type="text"
                value={settings.address_postal_code}
                onChange={(e) => handleInputChange('address_postal_code', e.target.value)}
                placeholder="00000-000"
                maxLength={9}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address_street">Endereço (Rua/Logradouro)</Label>
            <Input
              id="address_street"
              type="text"
              value={settings.address_street}
              onChange={(e) => handleInputChange('address_street', e.target.value)}
              placeholder="Rua das Flores, 123"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="address_city">Cidade</Label>
              <Input
                id="address_city"
                type="text"
                value={settings.address_city}
                onChange={(e) => handleInputChange('address_city', e.target.value)}
                placeholder="São Paulo"
              />
            </div>

            <div>
              <Label htmlFor="address_state">Estado</Label>
              <Input
                id="address_state"
                type="text"
                value={settings.address_state}
                onChange={(e) => handleInputChange('address_state', e.target.value)}
                placeholder="SP"
                maxLength={2}
              />
            </div>
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