import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationResult {
  code: string;
  name: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: unknown;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("🔍 Starting monthly subscriptions validation...");

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const validations: ValidationResult[] = [];

    // ========== V01: Integridade de Mensalidades ==========
    console.log("V01: Checking subscription integrity...");
    const { data: invalidSubs, error: v01Error } = await supabaseClient
      .from('monthly_subscriptions')
      .select('id, name, teacher_id')
      .or('name.is.null,teacher_id.is.null');

    if (v01Error) {
      validations.push({
        code: 'V01',
        name: 'Integridade de Mensalidades',
        status: 'error',
        message: `Erro na query: ${v01Error.message}`
      });
    } else if (invalidSubs && invalidSubs.length > 0) {
      validations.push({
        code: 'V01',
        name: 'Integridade de Mensalidades',
        status: 'error',
        message: `${invalidSubs.length} mensalidades com dados inválidos`,
        details: invalidSubs
      });
    } else {
      validations.push({
        code: 'V01',
        name: 'Integridade de Mensalidades',
        status: 'success',
        message: 'Todas mensalidades têm nome e teacher_id'
      });
    }

    // ========== V03: Duplicatas de Atribuição ==========
    console.log("V03: Checking assignment duplicates...");
    const { data: activeAssignments, error: v03Error } = await supabaseClient
      .from('student_monthly_subscriptions')
      .select('relationship_id')
      .eq('is_active', true);

    if (v03Error) {
      validations.push({
        code: 'V03',
        name: 'Duplicatas de Atribuição',
        status: 'error',
        message: `Erro na query: ${v03Error.message}`
      });
    } else {
      const counts: Record<string, number> = {};
      activeAssignments?.forEach(row => {
        counts[row.relationship_id] = (counts[row.relationship_id] || 0) + 1;
      });
      const duplicates = Object.entries(counts).filter(([, count]) => count > 1);

      if (duplicates.length > 0) {
        validations.push({
          code: 'V03',
          name: 'Duplicatas de Atribuição',
          status: 'error',
          message: `${duplicates.length} alunos com múltiplas assinaturas ativas`,
          details: duplicates.map(([id, count]) => ({ relationship_id: id, count }))
        });
      } else {
        validations.push({
          code: 'V03',
          name: 'Duplicatas de Atribuição',
          status: 'success',
          message: 'Nenhum aluno com múltiplas assinaturas ativas'
        });
      }
    }

    // ========== V04: Faturas Órfãs ==========
    console.log("V04: Checking orphan invoices...");
    const { data: orphanInvoices, error: v04Error } = await supabaseClient
      .from('invoices')
      .select('id, description, amount')
      .eq('invoice_type', 'monthly_subscription')
      .is('monthly_subscription_id', null);

    if (v04Error) {
      validations.push({
        code: 'V04',
        name: 'Faturas Órfãs',
        status: 'error',
        message: `Erro na query: ${v04Error.message}`
      });
    } else if (orphanInvoices && orphanInvoices.length > 0) {
      validations.push({
        code: 'V04',
        name: 'Faturas Órfãs',
        status: 'warning',
        message: `${orphanInvoices.length} faturas de mensalidade sem vínculo`,
        details: orphanInvoices.slice(0, 10)
      });
    } else {
      validations.push({
        code: 'V04',
        name: 'Faturas Órfãs',
        status: 'success',
        message: 'Todas faturas de mensalidade têm subscription_id'
      });
    }

    // ========== V05: Função count_completed_classes_in_month ==========
    console.log("V05: Testing count function...");
    try {
      // Buscar um professor real para testar
      const { data: teacher } = await supabaseClient
        .from('profiles')
        .select('id, timezone')
        .eq('role', 'professor')
        .limit(1)
        .maybeSingle();

      if (teacher) {
        // v3.3: Calcular ano/mês no timezone do professor
        const teacherTz = teacher.timezone || 'America/Sao_Paulo';
        const nowParts = new Intl.DateTimeFormat('en-CA', {
          timeZone: teacherTz,
          year: 'numeric',
          month: '2-digit',
        }).formatToParts(new Date());
        const tzYear = parseInt(nowParts.find(p => p.type === 'year')!.value);
        const tzMonth = parseInt(nowParts.find(p => p.type === 'month')!.value);
        
        const { data: countResult, error: countError } = await supabaseClient.rpc(
          'count_completed_classes_in_month',
          {
            p_teacher_id: teacher.id,
            p_student_id: teacher.id,
            p_year: tzYear,
            p_month: tzMonth,
            p_timezone: teacherTz
          }
        );

        if (countError) {
          validations.push({
            code: 'V05',
            name: 'Função de Contagem',
            status: 'error',
            message: `Função falhou: ${countError.message}`
          });
        } else {
          validations.push({
            code: 'V05',
            name: 'Função de Contagem',
            status: 'success',
            message: `Função executou corretamente (retornou: ${countResult})`
          });
        }
      } else {
        validations.push({
          code: 'V05',
          name: 'Função de Contagem',
          status: 'warning',
          message: 'Nenhum professor encontrado para testar'
        });
      }
    } catch (err) {
      validations.push({
        code: 'V05',
        name: 'Função de Contagem',
        status: 'error',
        message: `Exceção: ${err}`
      });
    }

    // ========== V06: Cascade de Desativação ==========
    console.log("V06: Checking cascade trigger...");
    const { data: cascadeCheck, error: v06Error } = await supabaseClient
      .from('student_monthly_subscriptions')
      .select(`
        id,
        is_active,
        subscription_id,
        monthly_subscriptions!inner (id, is_active)
      `)
      .eq('is_active', true);

    if (v06Error) {
      validations.push({
        code: 'V06',
        name: 'Trigger Cascade',
        status: 'error',
        message: `Erro na query: ${v06Error.message}`
      });
    } else {
      // Filtrar atribuições ativas para mensalidades inativas
      const problems = cascadeCheck?.filter(row => {
        const sub = row.monthly_subscriptions as unknown as { is_active: boolean };
        return !sub?.is_active;
      }) || [];

      if (problems.length > 0) {
        validations.push({
          code: 'V06',
          name: 'Trigger Cascade',
          status: 'error',
          message: `${problems.length} atribuições ativas para mensalidades inativas`,
          details: problems.slice(0, 10)
        });
      } else {
        validations.push({
          code: 'V06',
          name: 'Trigger Cascade',
          status: 'success',
          message: 'Trigger cascade funciona corretamente'
        });
      }
    }

    // ========== V07: Contagem de Faturas por Tipo ==========
    console.log("V07: Counting invoices by type...");
    const { data: monthlyInvoices, error: v07Error } = await supabaseClient
      .from('invoices')
      .select('id', { count: 'exact' })
      .eq('invoice_type', 'monthly_subscription');

    if (v07Error) {
      validations.push({
        code: 'V07',
        name: 'Faturas de Mensalidade',
        status: 'error',
        message: `Erro na query: ${v07Error.message}`
      });
    } else {
      validations.push({
        code: 'V07',
        name: 'Faturas de Mensalidade',
        status: 'success',
        message: `${monthlyInvoices?.length || 0} faturas de mensalidade no sistema`
      });
    }

    // ========== V08: Estatísticas Gerais ==========
    console.log("V08: Gathering statistics...");
    const { data: activeSubs } = await supabaseClient
      .from('monthly_subscriptions')
      .select('id', { count: 'exact' })
      .eq('is_active', true);

    const { data: inactiveSubs } = await supabaseClient
      .from('monthly_subscriptions')
      .select('id', { count: 'exact' })
      .eq('is_active', false);

    const { data: activeAssigns } = await supabaseClient
      .from('student_monthly_subscriptions')
      .select('id', { count: 'exact' })
      .eq('is_active', true);

    validations.push({
      code: 'V08',
      name: 'Estatísticas Gerais',
      status: 'success',
      message: `${activeSubs?.length || 0} ativas, ${inactiveSubs?.length || 0} inativas, ${activeAssigns?.length || 0} atribuições`,
      details: {
        subscriptions_active: activeSubs?.length || 0,
        subscriptions_inactive: inactiveSubs?.length || 0,
        assignments_active: activeAssigns?.length || 0
      }
    });

    // ========== RESULTADO FINAL ==========
    const successCount = validations.filter(v => v.status === 'success').length;
    const warningCount = validations.filter(v => v.status === 'warning').length;
    const errorCount = validations.filter(v => v.status === 'error').length;

    console.log(`✅ Validation complete: ${successCount} OK, ${warningCount} warnings, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: errorCount === 0,
        summary: {
          total: validations.length,
          success: successCount,
          warnings: warningCount,
          errors: errorCount
        },
        validations,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Validation error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
