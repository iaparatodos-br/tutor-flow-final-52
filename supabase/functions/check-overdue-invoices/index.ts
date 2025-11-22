import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    console.log("⚠️ Verificando faturas vencidas e próximas ao vencimento...");

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // 1. Buscar faturas pendentes vencidas
    const { data: overdueInvoices, error: overdueError } = await supabase
      .from("invoices")
      .select("id, due_date, student_id")
      .eq("status", "pendente")
      .lt("due_date", now.toISOString().split('T')[0]);

    if (overdueError) {
      console.error("Erro ao buscar faturas vencidas:", overdueError);
      throw overdueError;
    }

    console.log(`📋 Encontradas ${overdueInvoices?.length || 0} faturas vencidas`);

    let overdueProcessed = 0;

    // Processar faturas vencidas
    if (overdueInvoices && overdueInvoices.length > 0) {
      for (const invoice of overdueInvoices) {
        try {
          // Verificar se já enviou notificação de vencida
          const { data: existingNotification } = await supabase
            .from("class_notifications")
            .select("id")
            .eq("class_id", invoice.id)
            .eq("notification_type", "invoice_overdue")
            .maybeSingle();

          if (!existingNotification) {
            // Atualizar status da fatura
            await supabase
              .from("invoices")
              .update({ status: "overdue" })
              .eq("id", invoice.id);

            // Enviar notificação
            await supabase.functions.invoke('send-invoice-notification', {
              body: {
                invoice_id: invoice.id,
                notification_type: 'invoice_overdue'
              }
            });

            overdueProcessed++;
            console.log(`✅ Notificação de vencimento enviada para fatura ${invoice.id}`);
          }
        } catch (error) {
          console.error(`Erro ao processar fatura vencida ${invoice.id}:`, error);
        }
      }
    }

    // 2. Buscar faturas próximas ao vencimento (3 dias)
    const { data: upcomingInvoices, error: upcomingError } = await supabase
      .from("invoices")
      .select("id, due_date, student_id")
      .eq("status", "pendente")
      .gte("due_date", now.toISOString().split('T')[0])
      .lte("due_date", threeDaysFromNow.toISOString().split('T')[0]);

    if (upcomingError) {
      console.error("Erro ao buscar faturas próximas:", upcomingError);
      throw upcomingError;
    }

    console.log(`📋 Encontradas ${upcomingInvoices?.length || 0} faturas próximas ao vencimento`);

    let remindersProcessed = 0;

    // Processar lembretes
    if (upcomingInvoices && upcomingInvoices.length > 0) {
      for (const invoice of upcomingInvoices) {
        try {
          // Verificar se já enviou lembrete
          const { data: existingReminder } = await supabase
            .from("class_notifications")
            .select("id")
            .eq("class_id", invoice.id)
            .eq("notification_type", "invoice_payment_reminder")
            .maybeSingle();

          if (!existingReminder) {
            // Enviar lembrete
            await supabase.functions.invoke('send-invoice-notification', {
              body: {
                invoice_id: invoice.id,
                notification_type: 'invoice_payment_reminder'
              }
            });

            remindersProcessed++;
            console.log(`✅ Lembrete de pagamento enviado para fatura ${invoice.id}`);
          }
        } catch (error) {
          console.error(`Erro ao processar lembrete da fatura ${invoice.id}:`, error);
        }
      }
    }

    console.log(`✅ Processo concluído: ${overdueProcessed} vencidas, ${remindersProcessed} lembretes`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        overdue_processed: overdueProcessed,
        reminders_sent: remindersProcessed
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("❌ Erro ao verificar faturas:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
