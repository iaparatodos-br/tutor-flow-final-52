import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SecurityTestResult {
  test_name: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

interface SecurityAuditReport {
  overall_status: 'SECURE' | 'WARNING' | 'CRITICAL';
  timestamp: string;
  tests: SecurityTestResult[];
  recommendations: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validar se usuário tem permissão (deve ser professor)
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'professor') {
      throw new Error('Access denied. Only professors can run security audits.');
    }

    console.log(`Starting security audit for user: ${user.id}`);

    const tests: SecurityTestResult[] = [];
    const recommendations: string[] = [];

    // TESTE 1: Validar políticas RLS das tabelas principais
    console.log('Running RLS policies validation...');
    try {
      const { data: rlsValidation, error } = await supabaseAdmin
        .rpc('validate_rls_policies');

      if (error) throw error;

      const criticalTables = rlsValidation.filter((t: any) => t.security_status.includes('CRITICAL'));
      const warningTables = rlsValidation.filter((t: any) => t.security_status.includes('WARNING'));

      if (criticalTables.length > 0) {
        tests.push({
          test_name: 'RLS_POLICIES_CRITICAL',
          status: 'FAIL',
          message: `${criticalTables.length} tables have critical RLS issues`,
          details: criticalTables
        });
        recommendations.push('Fix critical RLS policies immediately - some tables have no protection');
      } else {
        tests.push({
          test_name: 'RLS_POLICIES_CRITICAL',
          status: 'PASS',
          message: 'No critical RLS policy issues found'
        });
      }

      if (warningTables.length > 0) {
        tests.push({
          test_name: 'RLS_POLICIES_WARNING',
          status: 'WARNING',
          message: `${warningTables.length} tables have RLS warnings`,
          details: warningTables
        });
        recommendations.push('Review RLS policies for tables with warnings to ensure adequate protection');
      }

    } catch (error) {
      tests.push({
        test_name: 'RLS_POLICIES_VALIDATION',
        status: 'FAIL',
        message: `Error validating RLS policies: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // TESTE 2: Testar isolamento de dados entre professores
    console.log('Testing data isolation between teachers...');
    try {
      // Buscar outro professor para testar isolamento
      const { data: otherTeachers, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'professor')
        .neq('id', user.id)
        .limit(1);

      if (error) throw error;

      if (otherTeachers && otherTeachers.length > 0) {
        // Tentar acessar dados de outro professor
        const { data: unauthorizedData, error: accessError } = await supabaseClient
          .from('teacher_student_relationships')
          .select('*')
          .eq('teacher_id', otherTeachers[0].id);

        if (unauthorizedData && unauthorizedData.length > 0) {
          tests.push({
            test_name: 'TEACHER_DATA_ISOLATION',
            status: 'FAIL',
            message: 'User can access other teachers data - RLS isolation failed',
            details: { accessed_records: unauthorizedData.length }
          });
          recommendations.push('CRITICAL: Fix teacher data isolation - RLS policies are not working properly');
        } else {
          tests.push({
            test_name: 'TEACHER_DATA_ISOLATION',
            status: 'PASS',
            message: 'Teacher data isolation working correctly'
          });
        }
      } else {
        tests.push({
          test_name: 'TEACHER_DATA_ISOLATION',
          status: 'WARNING',
          message: 'Cannot test isolation - no other teachers found'
        });
      }

    } catch (error) {
      tests.push({
        test_name: 'TEACHER_DATA_ISOLATION',
        status: 'WARNING',
        message: `Could not complete isolation test: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // TESTE 3: Validar acesso a dados financeiros sensíveis
    console.log('Testing financial data access controls...');
    try {
      // Verificar se usuário tem módulo financeiro
      const { data: hasFinancial } = await supabaseAdmin
        .rpc('teacher_has_financial_module', { teacher_id: user.id });

      if (hasFinancial) {
        // Testar acesso aos próprios dados financeiros
        const { data: invoices, error: invoiceError } = await supabaseClient
          .from('invoices')
          .select('*')
          .limit(5);

        if (invoiceError && invoiceError.code === 'PGRST301') {
          tests.push({
            test_name: 'FINANCIAL_DATA_ACCESS',
            status: 'FAIL',
            message: 'User with financial module cannot access their own financial data'
          });
          recommendations.push('Fix financial module RLS policies - users cannot access their own data');
        } else {
          tests.push({
            test_name: 'FINANCIAL_DATA_ACCESS',
            status: 'PASS',
            message: 'Financial data access working correctly for authorized users'
          });
        }
      } else {
        // Tentar acessar dados financeiros sem permissão
        const { data: unauthorizedInvoices, error: accessError } = await supabaseClient
          .from('invoices')
          .select('*')
          .limit(1);

        if (unauthorizedInvoices && unauthorizedInvoices.length > 0) {
          tests.push({
            test_name: 'FINANCIAL_DATA_ACCESS',
            status: 'FAIL',
            message: 'User without financial module can access financial data - security breach!'
          });
          recommendations.push('CRITICAL: Financial data is accessible to unauthorized users');
        } else {
          tests.push({
            test_name: 'FINANCIAL_DATA_ACCESS',
            status: 'PASS',
            message: 'Financial data properly restricted for users without financial module'
          });
        }
      }

    } catch (error) {
      tests.push({
        test_name: 'FINANCIAL_DATA_ACCESS',
        status: 'WARNING',
        message: `Could not complete financial access test: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // TESTE 4: Verificar se dados PII estão protegidos
    console.log('Testing PII data protection...');
    try {
      // Tentar acessar perfis de outros usuários
      const { data: allProfiles, error } = await supabaseClient
        .from('profiles')
        .select('id, email, cpf, guardian_email')
        .neq('id', user.id)
        .limit(5);

      if (allProfiles && allProfiles.length > 0) {
        const hasExposedPII = allProfiles.some(p => p.email || p.cpf || p.guardian_email);
        
        if (hasExposedPII) {
          tests.push({
            test_name: 'PII_DATA_PROTECTION',
            status: 'FAIL',
            message: 'PII data is exposed to unauthorized users',
            details: { exposed_profiles: allProfiles.length }
          });
          recommendations.push('CRITICAL: Personal information (PII) is accessible to unauthorized users');
        } else {
          tests.push({
            test_name: 'PII_DATA_PROTECTION',
            status: 'PASS',
            message: 'PII data properly protected'
          });
        }
      } else {
        tests.push({
          test_name: 'PII_DATA_PROTECTION',
          status: 'PASS',
          message: 'Cannot access other users PII data - protection working'
        });
      }

    } catch (error) {
      tests.push({
        test_name: 'PII_DATA_PROTECTION',
        status: 'WARNING',
        message: `Could not complete PII protection test: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // TESTE 5: Verificar logs de auditoria
    console.log('Testing audit logging...');
    try {
      // Verificar se há logs de auditoria recentes
      const { data: auditLogs, error } = await supabaseClient
        .from('audit_logs')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error && error.code === 'PGRST301') {
        tests.push({
          test_name: 'AUDIT_LOGGING',
          status: 'FAIL',
          message: 'Cannot access audit logs - RLS may be too restrictive'
        });
      } else if (auditLogs && auditLogs.length > 0) {
        tests.push({
          test_name: 'AUDIT_LOGGING',
          status: 'PASS',
          message: `Audit logging working - ${auditLogs.length} recent logs found`
        });
      } else {
        tests.push({
          test_name: 'AUDIT_LOGGING',
          status: 'WARNING',
          message: 'No recent audit logs found - logging may not be working'
        });
        recommendations.push('Verify audit logging is working properly');
      }

    } catch (error) {
      tests.push({
        test_name: 'AUDIT_LOGGING',
        status: 'WARNING',
        message: `Could not test audit logging: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // TESTE 6: Verificar novos logs de segurança
    console.log('Testing security audit logs...');
    try {
      // Log this security audit
      await supabaseAdmin.rpc('log_security_event', {
        p_action: 'security_audit_executed',
        p_resource_type: 'system',
        p_security_level: 'info',
        p_details: { test_count: tests.length }
      });

      tests.push({
        test_name: 'SECURITY_LOGGING',
        status: 'PASS',
        message: 'Security audit logging working correctly'
      });

    } catch (error) {
      tests.push({
        test_name: 'SECURITY_LOGGING',
        status: 'WARNING',
        message: `Security logging test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // Determinar status geral
    const failedTests = tests.filter(t => t.status === 'FAIL');
    const warningTests = tests.filter(t => t.status === 'WARNING');

    let overallStatus: 'SECURE' | 'WARNING' | 'CRITICAL';
    if (failedTests.length > 0) {
      overallStatus = 'CRITICAL';
      recommendations.unshift('IMMEDIATE ACTION REQUIRED: Critical security issues detected');
    } else if (warningTests.length > 0) {
      overallStatus = 'WARNING';
      recommendations.unshift('Review and address security warnings to improve protection');
    } else {
      overallStatus = 'SECURE';
      recommendations.unshift('Security audit completed successfully - all tests passed');
    }

    const report: SecurityAuditReport = {
      overall_status: overallStatus,
      timestamp: new Date().toISOString(),
      tests,
      recommendations
    };

    console.log(`Security audit completed. Status: ${overallStatus}, Tests: ${tests.length}`);

    return new Response(
      JSON.stringify(report),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Security audit error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        overall_status: 'CRITICAL',
        timestamp: new Date().toISOString(),
        tests: [],
        recommendations: ['Fix security audit system - cannot validate security']
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});