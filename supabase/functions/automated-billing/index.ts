import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Initialize services with guards
const resendKey = Deno.env.get("RESEND_API_KEY");
const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

const resend = resendKey ? new Resend(resendKey) : null;
const stripe = stripeKey ? new Stripe(stripeKey, {
  apiVersion: "2023-10-16",
}) : null;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting automated billing process...");
    
    // Get current date
    const now = new Date();
    const currentDay = now.getDate();
    
    // Get all professors with students due for billing today
    const { data: professors, error: profError } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        name,
        email,
        billing_day,
        stripe_customer_id,
        user_subscriptions!inner (
          id,
          status,
          subscription_plans!inner (
            id,
            features
          )
        ),
        profiles_students:profiles!profiles_teacher_id_fkey (
          id,
          name,
          email,
          cpf,
          guardian_name,
          guardian_email,
          guardian_phone,
          address_street,
          address_city,
          address_state,
          address_postal_code,
          address_complete,
          stripe_customer_id
        )
      `)
      .eq('role', 'professor')
      .eq('billing_day', currentDay);

    if (profError) {
      console.error("Error fetching professors:", profError);
      throw profError;
    }

    console.log(`Found ${professors?.length || 0} professors with billing due today`);

    for (const professor of professors || []) {
      console.log(`Processing billing for professor: ${professor.name}`);
      
      // Validate teacher can bill (has active subscription with financial module)
      const canBill = await validateTeacherCanBill(professor);
      
      if (!canBill) {
        console.log(`Skipping professor ${professor.name} - inactive subscription or no financial module`);
        continue;
      }
      
      console.log(`Professor ${professor.name} has financial module access, processing billing`);
      
      // Get students for this professor
      const students = professor.profiles_students || [];
      
      for (const student of students) {
        try {
          console.log(`Processing student: ${student.name}`);
          
          // Calculate monthly fee (for demo purposes, using a fixed amount)
          const monthlyFee = 200.00; // R$ 200.00 per month
          
          // Create invoice in database
          const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, professor.billing_day);
          
          const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .insert({
              teacher_id: professor.id,
              student_id: student.id,
              amount: monthlyFee,
              due_date: dueDate.toISOString().split('T')[0],
              payment_due_date: dueDate.toISOString().split('T')[0],
              description: `Mensalidade - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
              status: 'pendente',
              invoice_type: 'regular',
              payment_method: 'pix',
              sent_to_guardian: false
            })
            .select()
            .single();

          if (invoiceError) {
            console.error(`Error creating invoice for student ${student.name}:`, invoiceError);
            continue;
          }

          console.log(`Invoice created for student ${student.name}`);

          // Generate boleto automatically if student has complete profile
          if (student.address_complete && student.cpf && student.address_street && 
              student.address_city && student.address_state && student.address_postal_code) {
            try {
              console.log(`Generating boleto for student ${student.name}`);
              
              const boletoResponse = await supabaseAdmin.functions.invoke('generate-boleto-for-invoice', {
                body: { invoice_id: invoice.id }
              });

              if (boletoResponse.error) {
                console.error(`Error generating boleto for student ${student.name}:`, boletoResponse.error);
              } else {
                console.log(`Boleto generated successfully for student ${student.name}`);
              }
            } catch (boletoError) {
              console.error(`Error generating boleto for student ${student.name}:`, boletoError);
            }
          } else {
            console.log(`Skipping boleto generation for student ${student.name} - incomplete profile data`);
          }

          // Create Stripe invoice if student has Stripe customer ID and Stripe is available
          let stripeInvoiceUrl = null;
          if (student.stripe_customer_id && stripe) {
            try {
              const stripeInvoice = await stripe.invoices.create({
                customer: student.stripe_customer_id,
                description: `Mensalidade - ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
                metadata: {
                  supabase_invoice_id: invoice.id,
                  professor_id: professor.id,
                  student_id: student.id
                }
              });

              await stripe.invoiceItems.create({
                customer: student.stripe_customer_id,
                invoice: stripeInvoice.id,
                amount: Math.round(monthlyFee * 100), // Convert to cents
                currency: 'brl',
                description: `Mensalidade - ${professor.name}`
              });

              const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
              stripeInvoiceUrl = finalizedInvoice.hosted_invoice_url;

              // Update invoice with Stripe data
              await supabaseAdmin
                .from('invoices')
                .update({
                  stripe_invoice_id: stripeInvoice.id,
                  stripe_invoice_url: stripeInvoiceUrl
                })
                .eq('id', invoice.id);

              console.log(`Stripe invoice created for student ${student.name}`);
            } catch (stripeError) {
              console.error(`Error creating Stripe invoice for student ${student.name}:`, stripeError);
            }
          }

          // Send email notification
          const emailRecipient = student.guardian_email || student.email;
          const recipientName = student.guardian_name || student.name;

          if (emailRecipient && resend) {
            try {
              await resend.emails.send({
                from: `${professor.name} <noreply@resend.dev>`,
                to: [emailRecipient],
                subject: `Nova mensalidade disponível - ${professor.name}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Nova Mensalidade Disponível</h2>
                    <p>Olá ${recipientName},</p>
                    
                    <p>Uma nova mensalidade foi gerada para as aulas com <strong>${professor.name}</strong>.</p>
                    
                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h3 style="margin-top: 0;">Detalhes da Mensalidade</h3>
                      <p><strong>Aluno:</strong> ${student.name}</p>
                      <p><strong>Professor:</strong> ${professor.name}</p>
                      <p><strong>Valor:</strong> ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthlyFee)}</p>
                      <p><strong>Vencimento:</strong> ${dueDate.toLocaleDateString('pt-BR')}</p>
                      <p><strong>Descrição:</strong> ${invoice.description}</p>
                    </div>
                    
                    ${stripeInvoiceUrl ? `
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${stripeInvoiceUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                          Visualizar e Pagar Fatura
                        </a>
                      </div>
                    ` : `
                      <p>Entre em contato com ${professor.name} para mais informações sobre o pagamento.</p>
                    `}
                    
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="color: #666; font-size: 12px;">
                      Este é um email automático do sistema de gerenciamento de aulas.
                    </p>
                  </div>
                `
              });

              // Mark as sent to guardian
              await supabaseAdmin
                .from('invoices')
                .update({ sent_to_guardian: true })
                .eq('id', invoice.id);

              console.log(`Email sent to ${emailRecipient} for student ${student.name}`);
            } catch (emailError) {
              console.error(`Error sending email for student ${student.name}:`, emailError);
            }
          }

        } catch (studentError) {
          console.error(`Error processing student ${student.name}:`, studentError);
          continue;
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Automated billing completed",
        processed_professors: professors?.length || 0
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Error in automated billing:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// Validation function to check if teacher can bill
async function validateTeacherCanBill(professor: any): Promise<boolean> {
  try {
    // Check if professor has active subscription
    if (!professor.user_subscriptions || professor.user_subscriptions.length === 0) {
      return false;
    }

    const subscription = professor.user_subscriptions[0];
    
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