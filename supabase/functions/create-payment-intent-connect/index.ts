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

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select(`
        *,
        profiles!invoices_student_id_fkey(name, email, guardian_name, guardian_email),
        teacher:profiles!invoices_teacher_id_fkey(name, email)
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    logStep("Invoice found", { invoiceId: invoice_id, amount: invoice.amount });

    // Get teacher's connect account
    const { data: connectAccount, error: accountError } = await supabaseClient
      .from("stripe_connect_accounts")
      .select("*")
      .eq("teacher_id", invoice.teacher_id)
      .single();

    if (accountError || !connectAccount) {
      throw new Error("Teacher's Stripe Connect account not found");
    }

    if (!connectAccount.charges_enabled) {
      throw new Error("Teacher's Stripe account is not ready to accept payments");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Convert amount from decimal to cents
    const amountInCents = Math.round(parseFloat(invoice.amount) * 100);
    
    // Determine customer email
    const customerEmail = invoice.profiles?.guardian_email || invoice.profiles?.email;
    if (!customerEmail) {
      throw new Error("No email found for customer");
    }
    const billingName = payer_name || invoice.profiles?.guardian_name || invoice.profiles?.name || "Cliente";
    const billingEmail = payer_email || customerEmail;

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
        name: invoice.profiles?.guardian_name || invoice.profiles?.name,
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
              description: `Pagamento para ${invoice.profiles?.name}`
            }
          },
          quantity: 1
        }],
        mode: "payment",
        success_url: `${req.headers.get("origin") || "http://localhost:8080"}/financeiro?payment=success`,
        cancel_url: `${req.headers.get("origin") || "http://localhost:8080"}/financeiro?payment=cancelled`,
        payment_intent_data: {
          transfer_data: {
            destination: connectAccount.stripe_account_id,
          },
          application_fee_amount: Math.round(amountInCents * 0.03),
          description: `Fatura ${invoice.description || 'Mensalidade'} - ${invoice.profiles?.name}`,
          metadata: {
            invoice_id: invoice_id,
            student_id: invoice.student_id,
            teacher_id: invoice.teacher_id,
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
          gateway_provider: "stripe"
        })
        .eq("id", invoice_id);

      if (updateError) {
        logStep("Error updating invoice", updateError);
        throw new Error(`Database error: ${updateError.message}`);
      }

    } else {
      // For boleto and PIX, create payment intent
      let paymentMethodTypes: string[] = ["boleto"];
      let paymentMethodOptions: any = {
        boleto: {
          expires_after_days: 7
        }
      };

      if (payment_method === "pix") {
        paymentMethodTypes = ["pix"];
        paymentMethodOptions = {
          pix: {
            expires_after_seconds: 86400 // 24 hours
          }
        };
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "brl",
        customer: customerId,
        payment_method_types: paymentMethodTypes,
        payment_method_options: paymentMethodOptions,
        transfer_data: {
          destination: connectAccount.stripe_account_id,
        },
        application_fee_amount: Math.round(amountInCents * 0.03), // 3% platform fee
        description: `Fatura ${invoice.description || 'Mensalidade'} - ${invoice.profiles?.name}`,
        metadata: {
          invoice_id: invoice_id,
          student_id: invoice.student_id,
          teacher_id: invoice.teacher_id,
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
        gateway_provider: "stripe"
      };

      // Handle boleto and PIX specific responses (confirm with explicit payment_method_data)
      if (payment_method === "boleto") {
        // Boleto requires CPF/CNPJ (tax_id) and address
        if (!payer_tax_id) {
          throw new Error("Para boleto, é necessário informar payer_tax_id (CPF/CNPJ).");
        }
        if (!payer_address || !payer_address.street || !payer_address.city || !payer_address.state || !payer_address.postal_code) {
          throw new Error("Para boleto, é necessário informar o endereço completo (street, city, state, postal_code).");
        }
        
        const taxId = String(payer_tax_id).replace(/\D/g, "");
        const confirmedPI = await stripe.paymentIntents.confirm(paymentIntent.id, {
          payment_method_data: {
            type: "boleto",
            billing_details: {
              name: billingName,
              email: billingEmail,
              address: {
                line1: payer_address.street,
                city: payer_address.city,
                state: payer_address.state,
                postal_code: payer_address.postal_code,
                country: "BR"
              }
            },
            boleto: {
              tax_id: taxId,
            },
          },
        });
        if (confirmedPI.next_action?.display_boleto_details) {
          const boletoDetails = confirmedPI.next_action.display_boleto_details;
          updateData.boleto_url = boletoDetails.hosted_voucher_url;
          updateData.linha_digitavel = boletoDetails.number;
          response.boleto_url = boletoDetails.hosted_voucher_url;
          response.linha_digitavel = boletoDetails.number;
        }
      } else if (payment_method === "pix") {
        // For PIX, confirm with explicit payment_method_data to get QR code
        const confirmedPI = await stripe.paymentIntents.confirm(paymentIntent.id, {
          payment_method_data: { type: "pix" },
        });
        if (confirmedPI.next_action?.pix_display_qr_code) {
          const pixDetails = confirmedPI.next_action.pix_display_qr_code;
          updateData.pix_qr_code = pixDetails.data;
          updateData.pix_copy_paste = pixDetails.data;
          response.pix_qr_code = pixDetails.data;
          response.pix_copy_paste = pixDetails.data;
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-payment-intent-connect", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});