import { useState, useEffect } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Clock, Shield, Upload, FileText, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface CancellationPolicy {
  id: string;
  hours_before_class: number;
  charge_percentage: number;
  allow_amnesty: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_FILE_TYPES = ['application/pdf'];

const policyDocumentSchema = z.object({
  policyDocument: z
    .instanceof(FileList)
    .optional()
    .refine((files) => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE, 
      'Tamanho máximo do arquivo é 5MB.')
    .refine((files) => !files || files.length === 0 || ACCEPTED_FILE_TYPES.includes(files[0]?.type), 
      'Apenas arquivos PDF são aceitos.')
});

export function CancellationPolicySettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [policyDocumentUrl, setPolicyDocumentUrl] = useState<string | null>(null);
  
  const [hoursBeforeClass, setHoursBeforeClass] = useState([24]);
  const [chargePercentage, setChargePercentage] = useState([50]);
  const [allowAmnesty, setAllowAmnesty] = useState(true);

  const form = useForm<z.infer<typeof policyDocumentSchema>>({
    resolver: zodResolver(policyDocumentSchema),
  });

  useEffect(() => {
    if (profile?.id) {
      loadPolicy();
      loadPolicyDocument();
    }
  }, [profile]);

  const loadPolicyDocument = async () => {
    if (!profile?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('policy_document_url')
        .eq('id', profile.id)
        .single();

      if (error) throw error;
      setPolicyDocumentUrl(data?.policy_document_url || null);
    } catch (error) {
      console.error('Erro ao carregar documento da política:', error);
    }
  };

  const loadPolicy = async () => {
    try {
      const { data, error } = await supabase
        .from('cancellation_policies')
        .select('*')
        .eq('teacher_id', profile!.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPolicy(data);
        setHoursBeforeClass([data.hours_before_class]);
        setChargePercentage([data.charge_percentage]);
        setAllowAmnesty(data.allow_amnesty);
      }
    } catch (error) {
      console.error('Erro ao carregar política:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a política de cancelamento.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const savePolicy = async () => {
    if (!profile?.id) return;
    
    setSaving(true);
    try {
      const policyData = {
        teacher_id: profile.id,
        hours_before_class: hoursBeforeClass[0],
        charge_percentage: chargePercentage[0],
        allow_amnesty: allowAmnesty,
        is_active: true
      };

      if (policy) {
        // Update existing policy
        const { error } = await supabase
          .from('cancellation_policies')
          .update(policyData)
          .eq('id', policy.id);

        if (error) throw error;
      } else {
        // Create new policy
        const { error } = await supabase
          .from('cancellation_policies')
          .insert(policyData);

        if (error) throw error;
      }

      toast({
        title: "Sucesso",
        description: "Política de cancelamento salva com sucesso.",
      });

      loadPolicy(); // Reload to get updated data
    } catch (error) {
      console.error('Erro ao salvar política:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a política de cancelamento.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const uploadPolicyDocument = async (data: z.infer<typeof policyDocumentSchema>) => {
    if (!profile?.id || !data.policyDocument || data.policyDocument.length === 0) return;

    const file = data.policyDocument[0];
    setUploadingDocument(true);

    try {
      const filePath = `${profile.id}/policy.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('policies')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ policy_document_url: filePath })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setPolicyDocumentUrl(filePath);
      form.reset();
      
      toast({
        title: "Sucesso",
        description: "Documento da política enviado com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar o documento.",
        variant: "destructive",
      });
    } finally {
      setUploadingDocument(false);
    }
  };

  const removePolicyDocument = async () => {
    if (!profile?.id || !policyDocumentUrl) return;

    setUploadingDocument(true);

    try {
      const { error: deleteError } = await supabase.storage
        .from('policies')
        .remove([policyDocumentUrl]);

      if (deleteError) throw deleteError;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ policy_document_url: null })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setPolicyDocumentUrl(null);
      
      toast({
        title: "Sucesso",
        description: "Documento removido com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao remover documento:', error);
      toast({
        title: "Erro",
        description: "Não foi possível remover o documento.",
        variant: "destructive",
      });
    } finally {
      setUploadingDocument(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Política de Cancelamento
          </CardTitle>
          <CardDescription>
            Defina os termos para cancelamentos de suas aulas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="hours">
                Prazo Mínimo para Cancelamento (horas)
              </Label>
              <div className="mt-4">
                <Slider
                  value={hoursBeforeClass}
                  onValueChange={setHoursBeforeClass}
                  max={168}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-muted-foreground mt-2">
                  <span>1h</span>
                  <span className="font-medium">
                    {hoursBeforeClass[0]}h ({Math.round(hoursBeforeClass[0] / 24 * 10) / 10} dias)
                  </span>
                  <span>168h (7 dias)</span>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="percentage">
                Percentual de Cobrança por Cancelamento Tardio
              </Label>
              <div className="mt-4">
                <Slider
                  value={chargePercentage}
                  onValueChange={setChargePercentage}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-muted-foreground mt-2">
                  <span>0%</span>
                  <span className="font-medium">{chargePercentage[0]}%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="amnesty">Permitir Anistia</Label>
                <p className="text-sm text-muted-foreground">
                  Permite que você cancele cobranças individualmente
                </p>
              </div>
              <Switch
                id="amnesty"
                checked={allowAmnesty}
                onCheckedChange={setAllowAmnesty}
              />
            </div>
          </div>

          <Button onClick={savePolicy} disabled={saving} className="w-full">
            {saving ? "Salvando..." : policy ? "Atualizar Política" : "Criar Política"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Preview da Política
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              <strong>Sua política atual:</strong><br />
              • Alunos devem cancelar com pelo menos <strong>{hoursBeforeClass[0]} horas</strong> de antecedência<br />
              • Cancelamentos tardios serão cobrados em <strong>{chargePercentage[0]}%</strong> do valor da aula<br />
              • Anistia {allowAmnesty ? "permitida" : "não permitida"} pelo professor<br />
              • Cancelamentos pelo professor são sempre gratuitos para o aluno
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {policy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Informações da Política
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <strong>Criada em:</strong> {new Date(policy.created_at).toLocaleDateString()}
            </p>
            <p className="text-sm">
              <strong>Última atualização:</strong> {new Date(policy.updated_at).toLocaleDateString()}
            </p>
            <p className="text-sm">
              <strong>Status:</strong> {policy.is_active ? "Ativa" : "Inativa"}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documento da Política Completa
          </CardTitle>
          <CardDescription>
            Faça upload de um PDF com sua política completa de aulas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policyDocumentUrl ? (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">policy.pdf</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={removePolicyDocument}
                disabled={uploadingDocument}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remover
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(uploadPolicyDocument)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="policyDocument"
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormItem>
                      <FormLabel>Arquivo PDF (máx. 5MB)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="file"
                          accept=".pdf"
                          onChange={(e) => onChange(e.target.files)}
                          disabled={uploadingDocument}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={uploadingDocument} className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingDocument ? "Enviando..." : "Enviar Documento"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}