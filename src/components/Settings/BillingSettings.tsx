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
import { DollarSign, Calendar, Loader2, Info, CreditCard, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function BillingSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('billing');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chargeTiming, setChargeTiming] = useState<'prepaid' | 'postpaid'>('postpaid');
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null);

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

      const { data: bpData, error: bpError } = await supabase
        .from('business_profiles')
        .select('id, charge_timing')
        .eq('user_id', profile!.id)
        .maybeSingle();

      if (bpError) {
        console.error('Erro ao carregar business profile:', bpError);
      } else if (bpData) {
        setBusinessProfileId(bpData.id);
        setChargeTiming((bpData.charge_timing as 'prepaid' | 'postpaid') || 'postpaid');
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

      if (businessProfileId) {
        const { error: bpError } = await supabase
          .from('business_profiles')
          .update({ charge_timing: chargeTiming })
          .eq('id', businessProfileId);

        if (bpError) throw bpError;
      }

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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Charge Timing Card */}
        {businessProfileId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('chargeTiming.title')}
              </CardTitle>
              <CardDescription>
                {t('chargeTiming.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setChargeTiming('prepaid')}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all hover:bg-accent/50",
                    chargeTiming === 'prepaid'
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className={cn("h-5 w-5", chargeTiming === 'prepaid' ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("font-semibold", chargeTiming === 'prepaid' ? "text-primary" : "text-foreground")}>
                      {t('chargeTiming.prepaid')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('chargeTiming.prepaidDescription')}</p>
                </button>

                <button
                  type="button"
                  onClick={() => setChargeTiming('postpaid')}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all hover:bg-accent/50",
                    chargeTiming === 'postpaid'
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Clock className={cn("h-5 w-5", chargeTiming === 'postpaid' ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("font-semibold", chargeTiming === 'postpaid' ? "text-primary" : "text-foreground")}>
                      {t('chargeTiming.postpaid')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('chargeTiming.postpaidDescription')}</p>
                </button>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t('chargeTiming.infoTitle')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('chargeTiming.infoContent')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Billing Form Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {t('title')}
            </CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                  <FormDescription>{t('fields.paymentDueDays.description')}</FormDescription>
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
                  <FormDescription>{t('fields.defaultBillingDay.description')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Global Save Button - outside both cards */}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
