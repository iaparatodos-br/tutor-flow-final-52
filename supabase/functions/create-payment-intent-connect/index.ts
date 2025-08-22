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

    const { invoice_id, payment_method = "boleto" } = await req.json();
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

    // Payment method specific configuration
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
    } else if (payment_method === "card") {
      paymentMethodTypes = ["card"];
      paymentMethodOptions = {
        card: {
          capture_method: "automatic"
        }
      };
    }

    // Create payment intent
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

    logStep("Payment intent created", { 
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      paymentMethod: payment_method 
    });

    // Update invoice with payment intent details
    const updateData: any = {
      stripe_payment_intent_id: paymentIntent.id,
      gateway_provider: "stripe"
    };

    // For boleto, we need to get the boleto URL after confirmation
    if (payment_method === "boleto") {
      // Create a setup intent or use the payment intent client secret for boleto
      updateData.boleto_url = `https://checkout.stripe.com/pay/${paymentIntent.client_secret}`;
    } else if (payment_method === "pix") {
      updateData.pix_qr_code = paymentIntent.client_secret;
    }

    const { error: updateError } = await supabaseClient
      .from("invoices")
      .update(updateData)
      .eq("id", invoice_id);

    if (updateError) {
      logStep("Error updating invoice", updateError);
      throw new Error(`Database error: ${updateError.message}`);
    }

    logStep("Invoice updated successfully");

    return new Response(JSON.stringify({
      payment_intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      amount: amountInCents,
      currency: "brl",
      payment_method: payment_method,
      ...(payment_method === "boleto" && { boleto_url: updateData.boleto_url }),
      ...(payment_method === "pix" && { pix_qr_code: paymentIntent.client_secret })
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