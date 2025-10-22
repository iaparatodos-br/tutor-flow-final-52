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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation('settings');
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [policyDocumentUrl, setPolicyDocumentUrl] = useState<string | null>(null);
  
  const [hoursBeforeClass, setHoursBeforeClass] = useState([24]);
  const [chargePercentage, setChargePercentage] = useState([50]);
  const [allowAmnesty, setAllowAmnesty] = useState(true);

  const policyDocumentSchema = z.object({
    policyDocument: z
      .instanceof(FileList)
      .optional()
      .refine((files) => !files || files.length === 0 || files[0]?.size <= MAX_FILE_SIZE, 
        t('cancellationPolicy.document.validations.fileSize'))
      .refine((files) => !files || files.length === 0 || ACCEPTED_FILE_TYPES.includes(files[0]?.type), 
        t('cancellationPolicy.document.validations.fileType'))
  });

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
        title: t('cancellationPolicy.error'),
        description: t('cancellationPolicy.error'),
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
        title: t('cancellationPolicy.success'),
        description: t('cancellationPolicy.success'),
      });

      loadPolicy(); // Reload to get updated data
    } catch (error) {
      console.error('Erro ao salvar política:', error);
      toast({
        title: t('cancellationPolicy.error'),
        description: t('cancellationPolicy.error'),
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
        title: t('cancellationPolicy.uploadSuccess'),
        description: t('cancellationPolicy.uploadSuccess'),
      });
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: t('cancellationPolicy.error'),
        description: t('cancellationPolicy.error'),
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
        title: t('cancellationPolicy.removeSuccess'),
        description: t('cancellationPolicy.removeSuccess'),
      });
    } catch (error) {
      console.error('Erro ao remover documento:', error);
      toast({
        title: t('cancellationPolicy.error'),
        description: t('cancellationPolicy.error'),
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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Main Settings Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Policy Configuration */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('cancellationPolicy.title')}
            </CardTitle>
            <CardDescription>
              {t('cancellationPolicy.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="hours" className="text-sm font-medium">
                  {t('cancellationPolicy.hoursBeforeClass')}
                </Label>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('cancellationPolicy.hoursBeforeClassDescription')}
                </p>
                <div className="px-2">
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
                    <span className="font-semibold text-foreground">
                      {hoursBeforeClass[0]}h ({Math.round(hoursBeforeClass[0] / 24 * 10) / 10} dias)
                    </span>
                    <span>168h</span>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="percentage" className="text-sm font-medium">
                  {t('cancellationPolicy.chargePercentage')}
                </Label>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('cancellationPolicy.chargePercentageDescription')}
                </p>
                <div className="px-2">
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
                    <span className="font-semibold text-foreground">{chargePercentage[0]}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div>
                  <Label htmlFor="amnesty" className="text-sm font-medium">{t('cancellationPolicy.amnesty')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('cancellationPolicy.amnestyDescription')}
                  </p>
                </div>
                <Switch
                  id="amnesty"
                  checked={allowAmnesty}
                  onCheckedChange={setAllowAmnesty}
                />
              </div>
            </div>

            <Button onClick={savePolicy} disabled={saving} className="w-full" size="lg">
              {saving ? t('cancellationPolicy.saving') : t('cancellationPolicy.save')}
            </Button>
          </CardContent>
        </Card>

        {/* Preview da Política */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {t('cancellationPolicy.preview.title')}
            </CardTitle>
            <CardDescription>
              {t('cancellationPolicy.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="border-primary/20 bg-primary/5">
              <AlertDescription className="text-sm">
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">{t('cancellationPolicy.preview.title')}</p>
                  <ul className="space-y-1 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{t('cancellationPolicy.preview.rule1', { hours: hoursBeforeClass[0] })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-warning">•</span>
                      <span>{t('cancellationPolicy.preview.rule2', { hours: hoursBeforeClass[0], percentage: chargePercentage[0] })}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-success">•</span>
                      <span>{t('cancellationPolicy.preview.rule3', { 
                        enabled: allowAmnesty ? t('cancellationPolicy.preview.amnestyEnabled') : t('cancellationPolicy.preview.amnestyDisabled')
                      })}</span>
                    </li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>

            {policy && (
              <div className="mt-4 pt-4 border-t space-y-2">
                <p className="text-xs text-muted-foreground">
                  <strong>Criado em:</strong> {new Date(policy.created_at).toLocaleDateString('pt-BR')}
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Atualizado em:</strong> {new Date(policy.updated_at).toLocaleDateString('pt-BR')}
                </p>
                <p className="text-xs">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    policy.is_active 
                      ? 'bg-success/10 text-success' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {policy.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Document Upload */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('cancellationPolicy.document.title')}
          </CardTitle>
          <CardDescription>
            {t('cancellationPolicy.document.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policyDocumentUrl ? (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-success/5 border-success/20">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium">{t('cancellationPolicy.document.current')}</p>
                  <p className="text-sm text-muted-foreground">{t('cancellationPolicy.document.view')}</p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={removePolicyDocument}
                disabled={uploadingDocument}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('cancellationPolicy.document.remove')}
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(uploadPolicyDocument)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="policyDocument"
                    render={({ field: { value, onChange, ...field } }) => (
                      <FormItem>
                        <FormLabel>{t('cancellationPolicy.document.upload')}</FormLabel>
                        <FormControl>
                          <div className="min-h-[50px] flex items-center">
                            <Input
                              {...field}
                              type="file"
                              accept=".pdf"
                              onChange={(e) => onChange(e.target.files)}
                              disabled={uploadingDocument}
                              className="h-12 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={uploadingDocument} className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingDocument ? t('cancellationPolicy.saving') : t('cancellationPolicy.document.upload')}
                  </Button>
                </form>
              </Form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}