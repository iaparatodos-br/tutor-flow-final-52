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

export function ProfileSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
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
    
    // Para agora, apenas mostrar informação
    setTimeout(() => {
      toast({
        title: "Informação",
        description: "Funcionalidade de edição será implementada em breve.",
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
            Informações Pessoais
          </CardTitle>
          <CardDescription>
            Atualize suas informações de perfil
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              O email não pode ser alterado aqui
            </p>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Outras informações de perfil podem ser editadas através do seu perfil principal.
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={loading} className="w-full">
        {loading ? "Ver Informações" : "Ver Perfil Completo"}
      </Button>
    </div>
  );
}