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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DollarSign, Calendar, Loader2, CreditCard, QrCode, Receipt, TrendingDown } from "lucide-react";
import { useTranslation } from "react-i18next";

export function BillingSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation('billing');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const billingSchema = z.object({
    payment_due_days: z.number().min(1, t('validation.minDays')).max(90, t('validation.maxDays')),
    default_billing_day: z.number().min(1, t('validation.dayRange')).max(28, t('validation.dayRange')).optional().nullable(),
    default_payment_method: z.enum(['pix', 'boleto']).default('pix'),
  });

  type BillingFormData = z.infer<typeof billingSchema>;

  const form = useForm<BillingFormData>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      payment_due_days: 15,
      default_billing_day: null,
      default_payment_method: 'pix',
    },
  });

  useEffect(() => {
    if (profile?.id) {
      loadBillingSettings();
    }
  }, [profile]);

  const loadBillingSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('payment_due_days, default_billing_day, default_payment_method')
        .eq('id', profile!.id)
        .single();

      if (error) throw error;

      form.reset({
        payment_due_days: (data as any)?.payment_due_days || 15,
        default_billing_day: (data as any)?.default_billing_day || null,
        default_payment_method: (data as any)?.default_payment_method || 'pix',
      });
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
          default_payment_method: data.default_payment_method,
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
      <CardContent className="space-y-6">
        {/* Fee Comparison Alert */}
        <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <TrendingDown className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-900 dark:text-green-100">
            {t('feeComparison.title')}
          </AlertTitle>
          <AlertDescription className="text-green-800 dark:text-green-200">
            <div className="grid md:grid-cols-2 gap-3 mt-2">
              {/* PIX */}
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-md border border-green-300 dark:border-green-700">
                <div className="flex items-center gap-2 mb-1">
                  <QrCode className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="font-semibold">{t('feeComparison.pix')} - {t('feeComparison.recommended')}</span>
                </div>
                <p className="text-sm">{t('fields.defaultPaymentMethod.options.pix')}</p>
                <p className="text-xs text-green-700 dark:text-green-300">{t('feeComparison.pixExample')}</p>
              </div>
              
              {/* Boleto */}
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-600">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <span className="font-semibold">{t('feeComparison.boleto')}</span>
                </div>
                <p className="text-sm">{t('fields.defaultPaymentMethod.options.boleto')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('feeComparison.boletoFixed')}</p>
              </div>
            </div>
            
            <p className="font-medium text-green-600 dark:text-green-400 mt-3 text-sm">
              💡 {t('feeComparison.savings', { students: 34, amount: '78,20' })}
            </p>
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Default Payment Method */}
            <FormField
              control={form.control}
              name="default_payment_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    {t('fields.defaultPaymentMethod.label')}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('fields.defaultPaymentMethod.placeholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pix">
                        <div className="flex items-center gap-2">
                          <QrCode className="h-4 w-4 text-green-600" />
                          <span>{t('fields.defaultPaymentMethod.options.pix')}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="boleto">
                        <div className="flex items-center gap-2">
                          <Receipt className="h-4 w-4" />
                          <span>{t('fields.defaultPaymentMethod.options.boleto')}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('fields.defaultPaymentMethod.description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
  );
}
