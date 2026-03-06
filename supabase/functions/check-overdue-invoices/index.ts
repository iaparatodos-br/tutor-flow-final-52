import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get "today" date string (YYYY-MM-DD) in a specific timezone
function getTodayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

// Get date N days from now in a specific timezone (YYYY-MM-DD)
function getDateOffsetInTimezone(timezone: string, daysOffset: number): string {
  const now = new Date();
  const future = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(future);
}

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

    console.log("⚠️ Verificando faturas vencidas e próximas ao vencimento (timezone-aware)...");

    // 1. Buscar faturas pendentes com o fuso do professor
    const { data: pendingInvoices, error: fetchError } = await supabase
      .from("invoices")
      .select("id, due_date, student_id, teacher_id, status")
      .in("status", ["pendente"]);

    if (fetchError) {
      console.error("Erro ao buscar faturas:", fetchError);
      throw fetchError;
    }

    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log("📋 Nenhuma fatura pendente encontrada");
      return new Response(
        JSON.stringify({ success: true, overdue_processed: 0, reminders_sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Fetch teacher timezones in batch
    const teacherIds = [...new Set(pendingInvoices.map(inv => inv.teacher_id))];
    const { data: teacherProfiles } = await supabase
      .from("profiles")
      .select("id, timezone")
      .in("id", teacherIds);

    const tzMap = new Map((teacherProfiles || []).map(p => [p.id, p.timezone || 'America/Sao_Paulo']));

    let overdueProcessed = 0;
    let remindersProcessed = 0;

    for (const invoice of pendingInvoices) {
      try {
        const teacherTz = tzMap.get(invoice.teacher_id) || 'America/Sao_Paulo';
        const todayLocal = getTodayInTimezone(teacherTz);
        const threeDaysFromNowLocal = getDateOffsetInTimezone(teacherTz, 3);

        // Check if overdue: due_date < today (in teacher's local timezone)
        if (invoice.due_date < todayLocal) {
          // Check for existing notification
          const { data: existingNotification } = await supabase
            .from("teacher_notifications")
            .select("id")
            .eq("source_type", "invoice")
            .eq("source_id", invoice.id)
            .eq("category", "overdue_invoices")
            .maybeSingle();

          if (!existingNotification) {
            // Guard: only update if still pendente
            const { data: currentInvoice } = await supabase
              .from("invoices")
              .select("status")
              .eq("id", invoice.id)
              .maybeSingle();

            const terminalStatuses = ['paga', 'cancelada', 'vencida'];
            if (currentInvoice && terminalStatuses.includes(currentInvoice.status)) {
              console.log(`⏭️ Fatura ${invoice.id} já em status terminal (${currentInvoice.status}), pulando`);
              continue;
            }

            // Mark as overdue
            await supabase
              .from("invoices")
              .update({ status: "vencida" })
              .eq("id", invoice.id)
              .eq("status", "pendente");

            // Insert tracking notification
            await supabase
              .from("teacher_notifications")
              .insert({
                teacher_id: invoice.teacher_id,
                source_type: "invoice",
                source_id: invoice.id,
                category: "overdue_invoices",
                status: "inbox",
                is_read: false,
              });

            // Send email notification
            await supabase.functions.invoke('send-invoice-notification', {
              body: { invoice_id: invoice.id, notification_type: 'invoice_overdue' }
            });

            overdueProcessed++;
            console.log(`✅ Fatura ${invoice.id} marcada como vencida (tz: ${teacherTz}, today: ${todayLocal}, due: ${invoice.due_date})`);
          } else {
            console.log(`⏭️ Notificação já existe para fatura ${invoice.id}, pulando`);
          }
        }
        // Check if due within 3 days: today <= due_date <= today+3
        else if (invoice.due_date >= todayLocal && invoice.due_date <= threeDaysFromNowLocal) {
          const { data: existingReminder } = await supabase
            .from("teacher_notifications")
            .select("id")
            .eq("source_type", "invoice")
            .eq("source_id", invoice.id)
            .eq("category", "payment_reminder")
            .maybeSingle();

          if (!existingReminder) {
            await supabase
              .from("teacher_notifications")
              .insert({
                teacher_id: invoice.teacher_id,
                source_type: "invoice",
                source_id: invoice.id,
                category: "payment_reminder",
                status: "inbox",
                is_read: false,
              });

            await supabase.functions.invoke('send-invoice-notification', {
              body: { invoice_id: invoice.id, notification_type: 'invoice_payment_reminder' }
            });

            remindersProcessed++;
            console.log(`✅ Lembrete enviado para fatura ${invoice.id} (tz: ${teacherTz}, today: ${todayLocal}, due: ${invoice.due_date})`);
          } else {
            console.log(`⏭️ Lembrete já existe para fatura ${invoice.id}, pulando`);
          }
        }
      } catch (error) {
        console.error(`Erro ao processar fatura ${invoice.id}:`, error);
      }
    }

    console.log(`✅ Processo concluído: ${overdueProcessed} vencidas, ${remindersProcessed} lembretes`);

    return new Response(
      JSON.stringify({
        success: true,
        overdue_processed: overdueProcessed,
        reminders_sent: remindersProcessed
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("❌ Erro ao verificar faturas:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        success: false
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
