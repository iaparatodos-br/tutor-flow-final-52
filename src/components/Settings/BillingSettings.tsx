import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/contexts/ProfileContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DollarSign, Calendar, Loader2, CreditCard, AlertTriangle, Receipt, QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";

const PAYMENT_METHODS = [
  { id: 'card', icon: CreditCard },
  { id: 'boleto', icon: Receipt },
  { id: 'pix', icon: QrCode },
] as const;

type PaymentMethodId = typeof PAYMENT_METHODS[number]['id'];

export function BillingSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('billing');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null);
  const [enabledMethods, setEnabledMethods] = useState<PaymentMethodId[]>(['card', 'boleto', 'pix']);

  const billingSchema = z.object({
    payment_due_days: z.number().min(1, t('validation.minDays')).max(90, t('validation.maxDays')),
    default_billing_day: z.number().min(1, t('validation.dayRange')).max(28, t('validation.dayRange')).optional().nullable(),
  });

  type BillingFormData = z.infer<typeof billingSchema>;

  const form = useForm<BillingFormData>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      payment_due_days: 15,
      default_billing_day: null,
    },
  });

  useEffect(() => {
    if (profile?.id) {
      loadSettings();
    }
  }, [profile]);

  const loadSettings = async () => {
    try {
      // Load billing settings from profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('payment_due_days, default_billing_day')
        .eq('id', profile!.id)
        .single();

      if (profileError) throw profileError;

      form.reset({
        payment_due_days: (profileData as any)?.payment_due_days || 15,
        default_billing_day: (profileData as any)?.default_billing_day || null,
      });

      // Load business profile and payment methods
      const { data: businessProfile, error: bpError } = await supabase
        .from('business_profiles')
        .select('id, enabled_payment_methods')
        .eq('user_id', profile!.id)
        .maybeSingle();

      if (bpError && bpError.code !== 'PGRST116') {
        console.error('Error loading business profile:', bpError);
      }

      if (businessProfile) {
        setBusinessProfileId(businessProfile.id);
        if (businessProfile.enabled_payment_methods && Array.isArray(businessProfile.enabled_payment_methods)) {
          setEnabledMethods(businessProfile.enabled_payment_methods as PaymentMethodId[]);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configurações de cobrança:', error);
      toast({
        title: t('messages.loadError'),
        description: t('messages.tryAgain'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: BillingFormData) => {
    if (!profile?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          payment_due_days: data.payment_due_days,
          default_billing_day: data.default_billing_day,
        })
        .eq('id', profile.id);

      if (error) throw error;

      toast({
        title: t('messages.updateSuccess'),
        description: t('messages.updateSuccessDescription'),
      });
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast({
        title: t('messages.saveError'),
        description: t('messages.tryAgain'),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePaymentMethod = (methodId: PaymentMethodId) => {
    setEnabledMethods(prev => {
      if (prev.includes(methodId)) {
        // Don't allow removing the last method
        if (prev.length === 1) {
          toast({
            title: t('paymentMethods.noMethodsError'),
            variant: "destructive",
          });
          return prev;
        }
        return prev.filter(m => m !== methodId);
      } else {
        return [...prev, methodId];
      }
    });
  };

  const savePaymentMethods = async () => {
    if (!businessProfileId) {
      toast({
        title: t('paymentMethods.loadError'),
        description: 'Nenhuma conta de negócios encontrada.',
        variant: "destructive",
      });
      return;
    }

    if (enabledMethods.length === 0) {
      toast({
        title: t('paymentMethods.noMethodsError'),
        variant: "destructive",
      });
      return;
    }

    setSavingMethods(true);
    try {
      const { error } = await supabase
        .from('business_profiles')
        .update({
          enabled_payment_methods: enabledMethods,
        })
        .eq('id', businessProfileId);

      if (error) throw error;

      toast({
        title: t('paymentMethods.saveSuccess'),
      });
    } catch (error) {
      console.error('Erro ao salvar métodos de pagamento:', error);
      toast({
        title: t('paymentMethods.saveError'),
        variant: "destructive",
      });
    } finally {
      setSavingMethods(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Billing Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>
            {t('subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="payment_due_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.paymentDueDays.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="90"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 15)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('fields.paymentDueDays.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="default_billing_day"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {t('fields.defaultBillingDay.label')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="28"
                        placeholder={t('fields.defaultBillingDay.placeholder')}
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseInt(value) : null);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('fields.defaultBillingDay.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? t('actions.saving') : t('actions.save')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Payment Methods Card */}
      {businessProfileId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('paymentMethods.title')}
            </CardTitle>
            <CardDescription>
              {t('paymentMethods.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {enabledMethods.length === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('paymentMethods.noMethodsWarning')}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                const isEnabled = enabledMethods.includes(method.id);
                
                return (
                  <div
                    key={method.id}
                    className={`flex items-start space-x-4 p-4 rounded-lg border transition-colors ${
                      isEnabled ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'
                    }`}
                  >
                    <Checkbox
                      id={`method-${method.id}`}
                      checked={isEnabled}
                      onCheckedChange={() => togglePaymentMethod(method.id)}
                    />
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor={`method-${method.id}`}
                        className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                      >
                        <Icon className="h-4 w-4" />
                        {t(`paymentMethods.${method.id}`)}
                      </label>
                      <p className="text-sm text-muted-foreground">
                        {t(`paymentMethods.${method.id}Description`)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={savePaymentMethods}
              disabled={savingMethods || enabledMethods.length === 0}
            >
              {savingMethods && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {savingMethods ? t('actions.saving') : t('actions.save')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
