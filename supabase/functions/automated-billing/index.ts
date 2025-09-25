import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

interface StudentBillingInfo {
  student_id: string;
  teacher_id: string;
  billing_day: number;
  stripe_customer_id: string | null;
  teacher_stripe_account_id: string | null;
  payment_due_days: number;
  student_name: string;
  teacher_name: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log("Starting automated billing process with Stripe Invoicing...");
    const today = new Date().getDate();

    // 1. Encontrar todos os relacionamentos professor-aluno que devem ser cobrados hoje
    const { data: relationshipsToBill, error: relationshipsError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select(`
        id,
        student_id,
        teacher_id,
        billing_day,
        stripe_customer_id,
        business_profile_id,
        teacher:profiles!teacher_id (
          id,
          name,
          email,
          payment_due_days,
          user_subscriptions!inner (
            id,
            status,
            subscription_plans!inner (
              id,
              features
            )
          )
        ),
        student:profiles!student_id (
          id,
          name,
          email
        ),
        payment_accounts (
          id,
          stripe_connect_account_id,
          stripe_charges_enabled,
          is_default
        )
      `)
      .eq('billing_day', today);

    if (relationshipsError) {
      console.error("Error fetching relationships:", relationshipsError);
      throw relationshipsError;
    }

    if (!relationshipsToBill || relationshipsToBill.length === 0) {
      console.log('Nenhum relacionamento para cobrar hoje.');
      return new Response(JSON.stringify({ message: 'Nenhum relacionamento para cobrar hoje.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${relationshipsToBill.length} relationships to bill today`);

    // Processar cada relacionamento
    for (const relationship of relationshipsToBill) {
      const teacher = Array.isArray(relationship.teacher) ? relationship.teacher[0] : relationship.teacher;
      const student = Array.isArray(relationship.student) ? relationship.student[0] : relationship.student;

      console.log(`Processing billing for: ${teacher?.name} -> ${student?.name}`);

      // Validar se o professor pode cobrar (tem assinatura ativa com módulo financeiro)
      const canBill = await validateTeacherCanBill(teacher);
      if (!canBill) {
        console.log(`Skipping ${teacher?.name} -> ${student?.name} - no financial module access`);
        continue;
      }

      const studentInfo: StudentBillingInfo = {
        student_id: relationship.student_id,
        teacher_id: relationship.teacher_id,
        billing_day: relationship.billing_day,
        stripe_customer_id: relationship.stripe_customer_id,
        teacher_stripe_account_id: relationship.payment_accounts?.find(acc => acc.is_default)?.stripe_connect_account_id || null,
        payment_due_days: teacher?.payment_due_days || 15,
        student_name: student?.name || '',
        teacher_name: teacher?.name || '',
      };

      if (!studentInfo.stripe_customer_id) {
        console.warn(`Skipping student ${studentInfo.student_name}: missing stripe_customer_id`);
        continue;
      }

      // Validar se há business_profile_id definido
      if (!relationship.business_profile_id) {
        console.warn(`Skipping student ${studentInfo.student_name}: no business profile defined for payment routing`);
        continue;
      }

      if (!studentInfo.teacher_stripe_account_id) {
        console.warn(`Skipping student ${studentInfo.student_name}: teacher missing stripe_connect_account_id`);
        continue;
      }

      // 2. Encontrar todas as aulas concluídas e não faturadas para este relacionamento
      const { data: classesToInvoice, error: classesError } = await supabaseAdmin
        .from('classes')
        .select(`
          id, 
          notes,
          service_id,
          class_date,
          class_services (
            id,
            name,
            price,
            description
          )
        `)
        .eq('student_id', studentInfo.student_id)
        .eq('teacher_id', studentInfo.teacher_id)
        .eq('status', 'realizada')
        .is('invoice_id', null);

      if (classesError) {
        console.error(`Error fetching classes for ${studentInfo.student_name}:`, classesError);
        continue;
      }

      if (!classesToInvoice || classesToInvoice.length === 0) {
        console.log(`Nenhuma aula para faturar para ${studentInfo.student_name}`);
        continue;
      }

      console.log(`Found ${classesToInvoice.length} classes to invoice for ${studentInfo.student_name}`);

      // Processar com Stripe
      try {
        // 3. Criar Itens da Fatura (Invoice Items) no Stripe
        let totalAmount = 0;
        for (const classItem of classesToInvoice) {
          const service = Array.isArray(classItem.class_services) ? classItem.class_services[0] : classItem.class_services;
          const amount = service?.price || 100; // Valor padrão se não houver serviço
          const description = service?.name || `Aula - ${new Date(classItem.class_date).toLocaleDateString('pt-BR')}`;
          
          await stripe.invoiceItems.create({
            customer: studentInfo.stripe_customer_id,
            amount: Math.round(amount * 100), // Stripe usa centavos
            currency: 'brl',
            description: description,
          }, {
            stripeAccount: studentInfo.teacher_stripe_account_id,
          });

          totalAmount += amount;
        }

        // 4. Criar a Fatura (Invoice) no Stripe
        const now = new Date();
        const invoice = await stripe.invoices.create({
          customer: studentInfo.stripe_customer_id,
          collection_method: 'send_invoice',
          days_until_due: studentInfo.payment_due_days,
          auto_advance: true,
          description: `Fatura - ${studentInfo.teacher_name} - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
          metadata: {
            teacher_id: studentInfo.teacher_id,
            student_id: studentInfo.student_id,
            relationship_id: relationship.id,
          }
        }, {
          stripeAccount: studentInfo.teacher_stripe_account_id,
        });

        console.log(`Stripe invoice ${invoice.id} created for ${studentInfo.student_name}`);

        // 5. Inserir a fatura em nosso banco de dados
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + studentInfo.payment_due_days);

        const { data: newInvoice, error: newInvoiceError } = await supabaseAdmin
          .from('invoices')
          .insert({
            student_id: studentInfo.student_id,
            teacher_id: studentInfo.teacher_id,
            amount: totalAmount,
            status: 'pendente',
            due_date: dueDate.toISOString().split('T')[0],
            stripe_invoice_id: invoice.id,
            stripe_hosted_invoice_url: invoice.hosted_invoice_url,
            description: `Fatura - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
            invoice_type: 'regular',
            business_profile_id: relationship.business_profile_id,
          })
          .select()
          .single();

        if (newInvoiceError) {
          console.error(`Error creating invoice in database for ${studentInfo.student_name}:`, newInvoiceError);
          continue;
        }

        // 6. Atualizar as aulas com o ID da nova fatura
        const classIds = classesToInvoice.map(c => c.id);
        const { error: updateClassesError } = await supabaseAdmin
          .from('classes')
          .update({ invoice_id: newInvoice.id })
          .in('id', classIds);

        if (updateClassesError) {
          console.error(`Error updating classes with invoice_id for ${studentInfo.student_name}:`, updateClassesError);
        }

        console.log(`Fatura ${invoice.id} criada com sucesso para ${studentInfo.student_name}`);

      } catch (stripeError) {
        console.error(`Erro no processamento do Stripe para ${studentInfo.student_name}:`, stripeError);
        continue;
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Processamento de faturamento com Stripe Invoicing concluído.',
      processed_relationships: relationshipsToBill.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Erro geral na função de faturamento:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// Validation function to check if teacher can bill
async function validateTeacherCanBill(teacher: any): Promise<boolean> {
  try {
    // Check if teacher has active subscription
    if (!teacher.user_subscriptions || teacher.user_subscriptions.length === 0) {
      return false;
    }

    const subscription = teacher.user_subscriptions[0];
    
    // Check if subscription is active
    if (subscription.status !== 'active') {
      return false;
    }

    // Check if plan has financial module
    const hasFinancialModule = subscription.subscription_plans?.features?.financial_module === true;
    
    return hasFinancialModule;
  } catch (error) {
    console.error('Error validating teacher billing permissions:', error);
    return false;
  }
}