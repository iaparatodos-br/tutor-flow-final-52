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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { business_profile_id } = await req.json();
    
    if (!business_profile_id) {
      throw new Error("business_profile_id é obrigatório");
    }

    console.log(`[VALIDATE-BUSINESS-PROFILE-DELETION] Validating deletion for profile: ${business_profile_id}`);

    // Verificar se há faturas vinculadas ao business profile
    const { data: invoices, error: invoicesError } = await supabaseClient
      .from("invoices")
      .select("id, status, amount, student_id")
      .eq("business_profile_id", business_profile_id)
      .limit(5); // Pegar apenas alguns para mostrar

    if (invoicesError) {
      console.error("Error checking invoices:", invoicesError);
      throw new Error("Erro ao verificar faturas vinculadas");
    }

    // Verificar se há relacionamentos professor-aluno vinculados
    const { data: relationships, error: relationshipsError } = await supabaseClient
      .from("teacher_student_relationships")
      .select("id, student_name")
      .eq("business_profile_id", business_profile_id)
      .limit(5);

    if (relationshipsError) {
      console.error("Error checking relationships:", relationshipsError);
      throw new Error("Erro ao verificar relacionamentos vinculados");
    }

    const issues = [];
    const warnings = [];

    // Verificar faturas ativas
    if (invoices && invoices.length > 0) {
      const activeInvoices = invoices.filter(inv => 
        inv.status === 'pendente' || inv.status === 'processando'
      );
      
      if (activeInvoices.length > 0) {
        issues.push({
          type: "critical",
          title: "Faturas Ativas Vinculadas",
          description: `Existem ${activeInvoices.length} fatura(s) ativa(s) vinculada(s) a este negócio. Exclua ou transfira essas faturas antes de prosseguir.`,
          count: activeInvoices.length,
          details: activeInvoices.map(inv => ({
            id: inv.id,
            status: inv.status,
            amount: inv.amount
          }))
        });
      }

      if (invoices.length > activeInvoices.length) {
        warnings.push({
          type: "warning",
          title: "Histórico de Faturas",
          description: `Este negócio possui ${invoices.length - activeInvoices.length} fatura(s) no histórico. Elas permanecerão no sistema mas ficarão sem referência de negócio.`,
          count: invoices.length - activeInvoices.length
        });
      }
    }

    // Verificar relacionamentos ativos
    if (relationships && relationships.length > 0) {
      issues.push({
        type: "critical",
        title: "Alunos Vinculados",
        description: `Existem ${relationships.length} aluno(s) vinculado(s) a este negócio. Transfira esses alunos para outro negócio antes de excluir.`,
        count: relationships.length,
        details: relationships.map(rel => ({
          id: rel.id,
          student_name: rel.student_name
        }))
      });
    }

    const canDelete = issues.length === 0;

    console.log(`[VALIDATE-BUSINESS-PROFILE-DELETION] Validation result: canDelete=${canDelete}, issues=${issues.length}, warnings=${warnings.length}`);

    return new Response(JSON.stringify({
      can_delete: canDelete,
      issues,
      warnings,
      summary: {
        total_invoices: invoices?.length || 0,
        total_relationships: relationships?.length || 0,
        blocking_issues: issues.length
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in validate-business-profile-deletion:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Erro interno do servidor",
      can_delete: false 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});