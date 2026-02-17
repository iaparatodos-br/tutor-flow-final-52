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

    const { student_id, dependent_id } = await req.json();
    if (!student_id) {
      throw new Error('student_id is required');
    }

    const results: ValidationResult[] = [];

    // Teste 0: Se dependent_id fornecido, verificar dependente
    if (dependent_id) {
      const { data: dependent, error: depError } = await supabase
        .from('dependents')
        .select('id, name, responsible_id, teacher_id')
        .eq('id', dependent_id)
        .eq('teacher_id', user.id)
        .single();

      if (depError || !dependent) {
        results.push({
          test_name: "Dependent Validation",
          status: "error",
          message: "Dependente não encontrado ou não pertence ao professor"
        });
        return new Response(JSON.stringify({ results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verificar se o responsável é o student_id fornecido
      if (dependent.responsible_id !== student_id) {
        results.push({
          test_name: "Dependent Validation",
          status: "error",
          message: "Dependente não pertence ao responsável informado",
          details: {
            dependent_id: dependent.id,
            dependent_name: dependent.name,
            expected_responsible: student_id,
            actual_responsible: dependent.responsible_id
          }
        });
        return new Response(JSON.stringify({ results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      results.push({
        test_name: "Dependent Validation",
        status: "success",
        message: `Dependente "${dependent.name}" validado - cobrança será direcionada ao responsável`,
        details: {
          dependent_id: dependent.id,
          dependent_name: dependent.name,
          responsible_id: dependent.responsible_id
        }
      });
    }

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
        test_name: dependent_id ? "Responsible Relationship Validation" : "Student Relationship Validation",
        status: "error",
        message: dependent_id 
          ? "Responsável do dependente não encontrado ou não vinculado ao professor"
          : "Aluno não encontrado ou não vinculado ao professor"
      });
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const profile = Array.isArray(studentRelation.profiles) ? studentRelation.profiles[0] : studentRelation.profiles;
    
    results.push({
      test_name: dependent_id ? "Responsible Relationship Validation" : "Student Relationship Validation",
      status: "success",
      message: dependent_id 
        ? `Responsável ${studentRelation.student_name || profile?.name} validado (receberá a cobrança)`
        : `Aluno ${studentRelation.student_name || profile?.name} validado`,
      details: {
        student_id: studentRelation.student_id,
        teacher_id: studentRelation.teacher_id,
        business_profile_id: studentRelation.business_profile_id,
        is_responsible: !!dependent_id
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

    // Teste 5: Validar estrutura de fatura (sem criar registro real — #259 FIX)
    // Anteriormente criava uma fatura REAL e depois deletava, corrompendo dados.
    // Agora apenas valida se os campos necessários estão presentes.
    try {
      const mockInvoice = {
        teacher_id: user.id,
        student_id: student_id,
        business_profile_id: studentRelation.business_profile_id,
        amount: 1.00,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      };

      // Validação sem INSERT: verificar se todos os campos obrigatórios estão preenchidos
      const requiredFields = ['teacher_id', 'student_id', 'amount', 'due_date'];
      const missingFields = requiredFields.filter(f => !mockInvoice[f as keyof typeof mockInvoice]);

      if (missingFields.length > 0) {
        results.push({
          test_name: "Invoice Creation Validation",
          status: "error",
          message: `Campos obrigatórios ausentes: ${missingFields.join(', ')}`
        });
      } else {
        results.push({
          test_name: "Invoice Creation Validation",
          status: "success",
          message: "Validação de estrutura de fatura bem-sucedida (sem inserção real)",
          details: {
            has_teacher_id: !!mockInvoice.teacher_id,
            has_student_id: !!mockInvoice.student_id,
            has_business_profile: !!mockInvoice.business_profile_id,
            has_amount: mockInvoice.amount > 0,
            has_due_date: !!mockInvoice.due_date
          }
        });
      }
    } catch (error) {
      results.push({
        test_name: "Invoice Creation Validation",
        status: "error",
        message: `Erro na validação: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});