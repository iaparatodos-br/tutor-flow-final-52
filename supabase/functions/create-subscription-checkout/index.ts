import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const { planSlug } = await req.json();
    if (!planSlug) throw new Error("Plan slug is required");

    // Get the plan details
    const { data: plan, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('slug', planSlug)
      .eq('is_active', true)
      .single();

    if (planError || !plan) throw new Error("Plan not found");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
    }

    // Create Stripe price if not exists
    let stripePriceId = plan.stripe_price_id;
    
    if (!stripePriceId) {
      const product = await stripe.products.create({
        name: `TutorFlow - ${plan.name}`,
        description: `Plano ${plan.name} do TutorFlow`
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_cents,
        currency: 'brl',
        recurring: {
          interval: plan.billing_interval as any
        }
      });

      stripePriceId = price.id;

      // Update plan with Stripe price ID
      await supabaseClient
        .from('subscription_plans')
        .update({ stripe_price_id: stripePriceId })
        .eq('id', plan.id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.get("origin") || "http://localhost:3000"}/subscription?success=true`,
      cancel_url: `${req.headers.get("origin") || "http://localhost:3000"}/planos?canceled=true`,
      metadata: {
        user_id: user.id,
        plan_id: plan.id
      }
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});