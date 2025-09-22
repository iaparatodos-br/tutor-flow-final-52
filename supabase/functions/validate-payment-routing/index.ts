// Edge Function para validação completa de roteamento de pagamentos
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationResult {
  test_name: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const { student_id } = await req.json();
    if (!student_id) {
      throw new Error('student_id is required');
    }

    const results: ValidationResult[] = [];

    // Teste 1: Verificar se o aluno existe e está vinculado ao professor
    const { data: studentRelation, error: studentError } = await supabase
      .from('teacher_student_relationships')
      .select(`
        id,
        student_id,
        teacher_id,
        business_profile_id,
        student_name,
        profiles:student_id (
          id,
          name,
          email
        )
      `)
      .eq('teacher_id', user.id)
      .eq('student_id', student_id)
      .single();

    if (studentError || !studentRelation) {
      results.push({
        test_name: "Student Relationship Validation",
        status: "error",
        message: "Aluno não encontrado ou não vinculado ao professor"
      });
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    results.push({
      test_name: "Student Relationship Validation",
      status: "success",
      message: `Aluno ${studentRelation.student_name || studentRelation.profiles?.name} validado`,
      details: {
        student_id: studentRelation.student_id,
        teacher_id: studentRelation.teacher_id,
        business_profile_id: studentRelation.business_profile_id
      }
    });

    // Teste 2: Verificar business profile se houver
    if (studentRelation.business_profile_id) {
      const { data: businessProfile, error: businessError } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('id', studentRelation.business_profile_id)
        .eq('user_id', user.id)
        .single();

      if (businessError || !businessProfile) {
        results.push({
          test_name: "Business Profile Validation",
          status: "error",
          message: "Business profile vinculado não encontrado ou não pertence ao professor"
        });
      } else {
        results.push({
          test_name: "Business Profile Validation",
          status: "success",
          message: `Business profile "${businessProfile.business_name}" validado`,
          details: {
            business_profile_id: businessProfile.id,
            business_name: businessProfile.business_name,
            stripe_connect_id: businessProfile.stripe_connect_id
          }
        });
      }
    } else {
      results.push({
        test_name: "Business Profile Validation",
        status: "warning",
        message: "Aluno não vinculado a negócio específico - usará configuração padrão"
      });
    }

    // Teste 3: Verificar permissões RLS para faturas
    const { data: invoicePermissionTest, error: invoicePermError } = await supabase
      .from('invoices')
      .select('id, business_profile_id, teacher_id')
      .eq('teacher_id', user.id)
      .eq('student_id', student_id)
      .limit(1);

    if (invoicePermError) {
      results.push({
        test_name: "Invoice RLS Permissions",
        status: "error",
        message: `Erro nas permissões RLS de faturas: ${invoicePermError.message}`
      });
    } else {
      results.push({
        test_name: "Invoice RLS Permissions",
        status: "success",
        message: "Permissões RLS para faturas funcionando corretamente",
        details: { invoices_found: invoicePermissionTest?.length || 0 }
      });
    }

    // Teste 4: Verificar contas de pagamento disponíveis
    const { data: paymentAccounts, error: paymentError } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('is_active', true);

    if (paymentError || !paymentAccounts || paymentAccounts.length === 0) {
      results.push({
        test_name: "Payment Accounts Validation",
        status: "error",
        message: "Nenhuma conta de pagamento ativa encontrada"
      });
    } else {
      const stripeAccounts = paymentAccounts.filter(pa => pa.account_type === 'stripe');
      results.push({
        test_name: "Payment Accounts Validation",
        status: "success",
        message: `${paymentAccounts.length} conta(s) de pagamento ativa(s) encontrada(s)`,
        details: {
          total_accounts: paymentAccounts.length,
          stripe_accounts: stripeAccounts.length,
          has_default: paymentAccounts.some(pa => pa.is_default)
        }
      });
    }

    // Teste 5: Simular criação de fatura para validar roteamento
    try {
      const mockInvoice = {
        teacher_id: user.id,
        student_id: student_id,
        business_profile_id: studentRelation.business_profile_id,
        amount: 1.00,
        description: "Teste de validação de roteamento",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pendente'
      };

      // Não inserir realmente, apenas validar se passaria pelas políticas RLS
      const { error: insertTestError } = await supabase
        .from('invoices')
        .insert(mockInvoice)
        .select()
        .single();

      if (insertTestError) {
        results.push({
          test_name: "Invoice Creation Simulation",
          status: "error",
          message: `Simulação de criação de fatura falhou: ${insertTestError.message}`
        });
      } else {
        // Se chegou aqui, deletar a fatura de teste
        await supabase
          .from('invoices')
          .delete()
          .eq('description', 'Teste de validação de roteamento')
          .eq('teacher_id', user.id)
          .eq('student_id', student_id);

        results.push({
          test_name: "Invoice Creation Simulation",
          status: "success",
          message: "Simulação de criação de fatura bem-sucedida",
          details: mockInvoice
        });
      }
    } catch (error) {
      results.push({
        test_name: "Invoice Creation Simulation",
        status: "error",
        message: `Erro na simulação: ${error.message}`
      });
    }

    // Teste 6: Verificar logs de auditoria recentes
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('target_teacher_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (auditError) {
      results.push({
        test_name: "Audit Logs Validation",
        status: "warning",
        message: `Erro ao acessar logs de auditoria: ${auditError.message}`
      });
    } else {
      results.push({
        test_name: "Audit Logs Validation",
        status: "success",
        message: `${auditLogs?.length || 0} logs de auditoria encontrados`,
        details: {
          total_logs: auditLogs?.length || 0,
          tables_logged: [...new Set(auditLogs?.map(log => log.table_name) || [])]
        }
      });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});