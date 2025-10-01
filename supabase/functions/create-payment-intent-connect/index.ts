import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-PAYMENT-INTENT-CONNECT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { invoice_id, payment_method = "boleto", payer_tax_id, payer_name, payer_email, payer_address } = await req.json();
    if (!invoice_id) throw new Error("invoice_id is required");

    // Get invoice details with business profile
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select(`
        *,
        student:profiles!invoices_student_id_fkey(
          name, email, cpf, guardian_name, guardian_email,
          address_street, address_city, address_state, address_postal_code, address_complete
        ),
        teacher:profiles!invoices_teacher_id_fkey(name, email, payment_due_days),
        business_profile:business_profiles!invoices_business_profile_id_fkey(
          id, business_name, stripe_connect_id
        )
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    logStep("Invoice found", { invoiceId: invoice_id, amount: invoice.amount });

    // VALIDAÇÕES DE INTEGRIDADE - Adicionadas conforme solicitado
    
    // 1. Validar que fatura possui business_profile_id
    if (!invoice.business_profile_id) {
      logStep("VALIDATION ERROR: Invoice missing business_profile_id", { invoiceId: invoice_id });
      throw new Error("Fatura não possui negócio definido para roteamento de pagamento");
    }

    // 2. Validar que business profile existe e está ativo
    if (!invoice.business_profile) {
      logStep("VALIDATION ERROR: Business profile not found", { 
        invoiceId: invoice_id, 
        businessProfileId: invoice.business_profile_id 
      });
      throw new Error("Negócio da fatura não encontrado");
    }

    // 3. Validar que business profile possui Stripe Connect ID
    const stripeConnectAccountId = invoice.business_profile.stripe_connect_id;
    if (!stripeConnectAccountId) {
      logStep("VALIDATION ERROR: No Stripe Connect ID", { 
        businessProfileId: invoice.business_profile_id,
        businessName: invoice.business_profile.business_name 
      });
      throw new Error("Conta Stripe Connect não encontrada para o negócio desta fatura");
    }

    logStep("Using business profile for payment routing", { 
      businessProfileId: invoice.business_profile_id,
      businessName: invoice.business_profile.business_name,
      stripeConnectAccountId 
    });

    // 4. VALIDAÇÃO DETALHADA DO STATUS DO STRIPE CONNECT - Adicionada conforme solicitado
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    try {
      const stripeAccount = await stripe.accounts.retrieve(stripeConnectAccountId);
      
      // Verificações detalhadas de integridade
      const accountIssues = [];
      const accountWarnings = [];
      
      // CRITICAL: Conta deve poder receber pagamentos
      if (!stripeAccount.charges_enabled) {
        accountIssues.push("Conta não habilitada para receber pagamentos");
      }
      
      // WARNING: Saques podem não estar habilitados ainda (não bloqueia pagamentos)
      if (!stripeAccount.payouts_enabled) {
        accountWarnings.push("Saques não habilitados - configure posteriormente para receber transferências");
      }
      
      // CRITICAL: Informações básicas devem estar completas
      if (!stripeAccount.details_submitted) {
        accountIssues.push("Informações da conta incompletas");
      }
      
      // WARNING: Documentos pendentes (pode não bloquear pagamentos dependendo do tipo)
      if (stripeAccount.requirements?.currently_due?.length > 0) {
        accountWarnings.push(`Documentos pendentes: ${stripeAccount.requirements.currently_due.join(", ")}`);
      }
      
      // Log warnings but don't fail
      if (accountWarnings.length > 0) {
        logStep("Stripe Connect account warnings", { 
          accountId: stripeConnectAccountId,
          warnings: accountWarnings,
          accountStatus: {
            charges_enabled: stripeAccount.charges_enabled,
            payouts_enabled: stripeAccount.payouts_enabled,
            details_submitted: stripeAccount.details_submitted
          }
        });
      }
      
      // Only fail on critical issues
      if (accountIssues.length > 0) {
        logStep("VALIDATION ERROR: Stripe Connect account critical issues", { 
          accountId: stripeConnectAccountId,
          issues: accountIssues,
          accountStatus: {
            charges_enabled: stripeAccount.charges_enabled,
            payouts_enabled: stripeAccount.payouts_enabled,
            details_submitted: stripeAccount.details_submitted
          }
        });
        throw new Error(`Problemas críticos na conta Stripe Connect: ${accountIssues.join("; ")}`);
      }
      
      logStep("Stripe Connect account validation passed", { 
        accountId: stripeConnectAccountId,
        chargesEnabled: stripeAccount.charges_enabled,
        payoutsEnabled: stripeAccount.payouts_enabled,
        detailsSubmitted: stripeAccount.details_submitted
      });
      
    } catch (stripeError) {
      logStep("CRITICAL ERROR: Failed to verify Stripe Connect account", { 
        error: stripeError,
        accountId: stripeConnectAccountId 
      });
      throw new Error("Erro crítico ao verificar conta Stripe Connect do negócio");
    }

    // Convert amount from decimal to cents
    const amountInCents = Math.round(parseFloat(invoice.amount) * 100);
    
    // Determine customer email
    const customerEmail = invoice.student?.guardian_email || invoice.student?.email;
    if (!customerEmail) {
      throw new Error("No email found for customer");
    }
    
    // Use profile data if not provided in request (for automated boleto generation)
    const finalPayerTaxId = payer_tax_id || invoice.student?.cpf;
    const finalPayerName = payer_name || invoice.student?.guardian_name || invoice.student?.name || "Cliente";
    const finalPayerEmail = payer_email || customerEmail;
    const finalPayerAddress = payer_address || (invoice.student?.address_complete ? {
      street: invoice.student.address_street,
      city: invoice.student.address_city,
      state: invoice.student.address_state,
      postal_code: invoice.student.address_postal_code
    } : null);

    // Create or get customer
    const customers = await stripe.customers.list({ 
      email: customerEmail, 
      limit: 1 
    });
    
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: customerEmail,
        name: invoice.student?.guardian_name || invoice.student?.name,
        metadata: {
          student_id: invoice.student_id,
          teacher_id: invoice.teacher_id
        }
      });
      customerId = customer.id;
    }

    logStep("Customer ready", { customerId, email: customerEmail });

    let response: any = {};

    if (payment_method === "card") {
      // For card payments, create a checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{
          price_data: {
            currency: "brl",
            unit_amount: amountInCents,
            product_data: {
              name: `Fatura ${invoice.description || 'Mensalidade'}`,
              description: `Pagamento para ${invoice.student?.name}`
            }
          },
          quantity:1
        }],
        mode: "payment",
        success_url: `${req.headers.get("origin") || "https://www.tutor-flow.app"}/financeiro?payment=success`,
        cancel_url: `${req.headers.get("origin") || "https://www.tutor-flow.app"}/financeiro?payment=cancelled`,
        allow_promotion_codes: true,
        payment_intent_data: {
          transfer_data: {
            destination: stripeConnectAccountId,
          },
          application_fee_amount: Math.round(amountInCents * 0.03),
          description: `Fatura ${invoice.description || 'Mensalidade'} - ${invoice.student?.name}`,
          metadata: {
            invoice_id: invoice_id,
            student_id: invoice.student_id,
            teacher_id: invoice.teacher_id,
            business_profile_id: invoice.business_profile_id,
            platform: "education-platform"
          }
        }
      });

      response = {
        checkout_url: session.url,
        session_id: session.id,
        payment_method: "card"
      };

      // Update invoice with session details
        const { error: updateError } = await supabaseClient
          .from("invoices")
          .update({
            stripe_payment_intent_id: session.payment_intent as string,
            gateway_provider: "stripe",
          })
          .eq("id", invoice_id);

      if (updateError) {
        logStep("Error updating invoice", updateError);
        throw new Error(`Database error: ${updateError.message}`);
      }

    } else {
      // For boleto and PIX
      if (payment_method === "pix") {
        // Create/get customer on the CONNECTED account
        const connectedCustomers = await stripe.customers.list({
          email: customerEmail,
          limit: 1,
        }, { stripeAccount: stripeConnectAccountId });

        let connectedCustomerId: string;
        if (connectedCustomers.data.length > 0) {
          connectedCustomerId = connectedCustomers.data[0].id;
        } else {
          const connectedCustomer = await stripe.customers.create({
            email: customerEmail,
            name: invoice.student?.guardian_name || invoice.student?.name,
            metadata: {
              student_id: invoice.student_id,
              teacher_id: invoice.teacher_id,
              business_profile_id: invoice.business_profile_id,
            },
          }, { stripeAccount: stripeConnectAccountId });
          connectedCustomerId = connectedCustomer.id;
        }
        logStep("Connected customer ready", { customerId: connectedCustomerId, account: stripeConnectAccountId });

        // Create PI directly on the connected account (Direct charge)
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "brl",
          customer: connectedCustomerId,
          payment_method_types: ["pix"],
          payment_method_options: { pix: { expires_after_seconds: 86400 } },
          application_fee_amount: Math.round(amountInCents * 0.03), // 3% platform fee
          description: `Fatura ${invoice.description || 'Mensalidade'} - ${invoice.student?.name}`,
          metadata: {
            invoice_id: invoice_id,
            student_id: invoice.student_id,
            teacher_id: invoice.teacher_id,
            business_profile_id: invoice.business_profile_id,
            platform: "education-platform"
          }
        }, { stripeAccount: stripeConnectAccountId });

        // Confirm to get QR code details
        const confirmedPI = await stripe.paymentIntents.confirm(paymentIntent.id, {
          payment_method_data: { type: "pix" },
        }, { stripeAccount: stripeConnectAccountId });

        const updateData: any = {
          stripe_payment_intent_id: paymentIntent.id,
          gateway_provider: "stripe",
        };
        if (confirmedPI.next_action?.pix_display_qr_code) {
          const pixDetails: any = confirmedPI.next_action.pix_display_qr_code;
          updateData.pix_qr_code = pixDetails.data;
          updateData.pix_copy_paste = pixDetails.data;
        } else {
          // Fallback retrieve
          const refreshedPI = await stripe.paymentIntents.retrieve(paymentIntent.id, { stripeAccount: stripeConnectAccountId });
          const pixDetails: any = (refreshedPI.next_action as any)?.pix_display_qr_code;
          if (pixDetails) {
            updateData.pix_qr_code = pixDetails.data;
            updateData.pix_copy_paste = pixDetails.data;
          }
        }

        // Persist and respond
        const { error: updateError } = await supabaseClient
          .from("invoices")
          .update(updateData)
          .eq("id", invoice_id);
        if (updateError) {
          logStep("Error updating invoice", updateError);
          throw new Error(`Database error: ${updateError.message}`);
        }

        response = {
          payment_intent_id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          payment_method: payment_method,
          pix_qr_code: updateData.pix_qr_code,
          pix_copy_paste: updateData.pix_copy_paste,
        };
      } else {
        // Default: boleto on platform using destination charges
        // Calculate days until due date, using teacher's payment_due_days as reference
        const dueDate = new Date(invoice.due_date);
        const today = new Date();
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Stripe boleto expires_after_days must be between 1 and 60
        // Use calculated days, but ensure it's within Stripe's limits
        const boletoExpireDays = Math.max(1, Math.min(60, daysUntilDue > 0 ? daysUntilDue : (invoice.teacher?.payment_due_days || 15)));
        
        logStep("Calculated boleto expiry", { 
          dueDate: invoice.due_date, 
          daysUntilDue, 
          boletoExpireDays,
          teacherPaymentDueDays: invoice.teacher?.payment_due_days
        });
        
        let paymentMethodTypes: string[] = ["boleto"];
        let paymentMethodOptions: any = {
          boleto: {
            expires_after_days: boletoExpireDays
          }
        };

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "brl",
          customer: customerId,
          payment_method_types: paymentMethodTypes,
          payment_method_options: paymentMethodOptions,
          transfer_data: {
            destination: stripeConnectAccountId,
          },
          application_fee_amount: Math.round(amountInCents * 0.03), // 3% platform fee
          description: `Fatura ${invoice.description || 'Mensalidade'} - ${invoice.student?.name}`,
          metadata: {
            invoice_id: invoice_id,
            student_id: invoice.student_id,
            teacher_id: invoice.teacher_id,
            business_profile_id: invoice.business_profile_id,
            platform: "education-platform"
          }
        });

        response = {
          payment_intent_id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
          payment_method: payment_method
        };

        // Update invoice with payment intent details
        const updateData: any = {
          stripe_payment_intent_id: paymentIntent.id,
          gateway_provider: "stripe",
        };

        // Handle boleto confirmation and retrieve boleto details
        // Boleto requires CPF/CNPJ (tax_id) and address
        if (!finalPayerTaxId) {
          throw new Error("Para boleto, é necessário informar payer_tax_id (CPF/CNPJ).");
        }
        if (!finalPayerAddress || !finalPayerAddress.street || !finalPayerAddress.city || !finalPayerAddress.state || !finalPayerAddress.postal_code) {
          throw new Error("Para boleto, é necessário informar o endereço completo (street, city, state, postal_code).");
        }
        
        const taxId = String(finalPayerTaxId).replace(/\D/g, "");
        const confirmedPI = await stripe.paymentIntents.confirm(paymentIntent.id, {
          payment_method_data: {
            type: "boleto",
            billing_details: {
              name: finalPayerName,
              email: finalPayerEmail,
              address: {
                line1: finalPayerAddress.street,
                city: finalPayerAddress.city,
                state: finalPayerAddress.state,
                postal_code: finalPayerAddress.postal_code,
                country: "BR"
              }
            },
            boleto: { tax_id: taxId },
          },
        });
        if ((confirmedPI.next_action as any)?.boleto_display_details) {
          const boletoDetails = (confirmedPI.next_action as any).boleto_display_details;
          updateData.boleto_url = boletoDetails.hosted_voucher_url;
          updateData.linha_digitavel = boletoDetails.number;
          response.boleto_url = boletoDetails.hosted_voucher_url;
          response.linha_digitavel = boletoDetails.number;
        } else {
          // Fallback: retrieve the PaymentIntent in case Stripe hasn't populated next_action yet
          const refreshedPI = await stripe.paymentIntents.retrieve(paymentIntent.id);
          const boletoDetails = (refreshedPI.next_action as any)?.boleto_display_details;
          if (boletoDetails) {
            updateData.boleto_url = boletoDetails.hosted_voucher_url;
            updateData.linha_digitavel = boletoDetails.number;
            response.boleto_url = boletoDetails.hosted_voucher_url;
            response.linha_digitavel = boletoDetails.number;
          }
        }

        const { error: updateError } = await supabaseClient
          .from("invoices")
          .update(updateData)
          .eq("id", invoice_id);

        if (updateError) {
          logStep("Error updating invoice", updateError);
          throw new Error(`Database error: ${updateError.message}`);
        }
      }

  }

  logStep("Payment processed successfully", { 
    amount: amountInCents,
    paymentMethod: payment_method 
  });

    return new Response(JSON.stringify({
      ...response,
      amount: amountInCents,
      currency: "brl"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    let errorMessage = rawMessage;
    if (rawMessage?.toLowerCase().includes('payment method type "pix" is invalid')) {
      errorMessage = 'PIX não está habilitado. Ative o método de pagamento PIX no seu Dashboard Stripe (platform e conta conectada) e tente novamente.';
    }
    logStep("ERROR in create-payment-intent-connect", { message: rawMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});