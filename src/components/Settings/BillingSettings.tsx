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
import { DollarSign, Calendar, Loader2 } from "lucide-react";

const billingSchema = z.object({
  payment_due_days: z.number().min(1, "Deve ser pelo menos 1 dia").max(90, "Máximo 90 dias"),
  default_billing_day: z.number().min(1, "Deve ser entre 1 e 28").max(28, "Deve ser entre 1 e 28").optional().nullable(),
});

type BillingFormData = z.infer<typeof billingSchema>;

export function BillingSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<BillingFormData>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      payment_due_days: 15,
      default_billing_day: null,
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
        .select('payment_due_days, default_billing_day')
        .eq('id', profile!.id)
        .single();

      if (error) throw error;

      form.reset({
        payment_due_days: data.payment_due_days || 15,
        default_billing_day: data.default_billing_day,
      });
    } catch (error) {
      console.error('Erro ao carregar configurações de cobrança:', error);
      toast({
        title: "Erro ao carregar configurações",
        description: "Tente novamente mais tarde",
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
        title: "Configurações atualizadas",
        description: "Suas configurações de cobrança foram salvas com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast({
        title: "Erro ao salvar configurações",
        description: "Tente novamente mais tarde",
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
            Configurações de Cobrança
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
          Configurações de Cobrança
        </CardTitle>
        <CardDescription>
          Configure os padrões para cobrança de alunos
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
                  <FormLabel>Prazo de Vencimento Padrão (em dias)</FormLabel>
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
                    Quantos dias após a criação da fatura ela deve vencer. Aplicado a todas as novas faturas.
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
                    Dia de Cobrança Padrão
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="28"
                      placeholder="15"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value ? parseInt(value) : null);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Dia do mês que será sugerido ao cadastrar novos alunos (1-28). Deixe vazio para não ter padrão.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Configurações
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}