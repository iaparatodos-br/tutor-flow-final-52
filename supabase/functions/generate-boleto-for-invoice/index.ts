import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GENERATE-BOLETO-FOR-INVOICE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { invoice_id } = await req.json();
    if (!invoice_id) throw new Error("invoice_id is required");

    logStep("Processing invoice", { invoice_id });

    // Get invoice and student profile data
    // Sequential queries to avoid FK join syntax (Etapa 0.6)
    const { data: invoiceRaw, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invoiceError) {
      logStep("Error fetching invoice", invoiceError);
      throw new Error("Erro ao buscar fatura");
    }

    if (!invoiceRaw) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Fatura não encontrada" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Verificar se o professor desativou a geração automática de boleto
    const { data: businessProfile } = await supabaseClient
      .from('business_profiles')
      .select('auto_generate_boleto')
      .eq('user_id', invoiceRaw.teacher_id)
      .maybeSingle();

    if (businessProfile?.auto_generate_boleto === false) {
      logStep("Boleto generation disabled by teacher settings", { teacherId: invoiceRaw.teacher_id });
      return new Response(JSON.stringify({
        success: false,
        error: "A geração automática de boletos está desativada pelo professor. Entre em contato com seu professor para obter os dados de pagamento."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { data: studentProfile } = await supabaseClient
      .from("profiles")
      .select("id, name, email, cpf, address_street, address_city, address_state, address_postal_code, address_complete")
      .eq("id", invoiceRaw.student_id)
      .maybeSingle();

    const { data: teacherProfile } = await supabaseClient
      .from("profiles")
      .select("name, email")
      .eq("id", invoiceRaw.teacher_id)
      .maybeSingle();

    const invoice = {
      ...invoiceRaw,
      student: studentProfile,
      teacher: teacherProfile,
    };

    if (invoiceError) {
      logStep("Error fetching invoice", invoiceError);
      throw new Error("Erro ao buscar fatura");
    }

    if (!invoice) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Fatura não encontrada" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // #151 - Guard clause: verificar status da fatura antes de gerar pagamento
    const allowedStatuses = ['pendente', 'open', 'falha_pagamento'];
    if (!allowedStatuses.includes(invoice.status)) {
      logStep("Invoice status not allowed for boleto generation", { status: invoice.status });
      return new Response(JSON.stringify({
        success: false,
        error: `Não é possível gerar boleto para fatura com status "${invoice.status}"`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (invoice.stripe_payment_intent_id) {
      logStep("Invoice already has a payment intent", { 
        existingPI: invoice.stripe_payment_intent_id 
      });
    }

    // VALIDAÇÃO DE VALOR MÍNIMO PARA BOLETO
    const MINIMUM_BOLETO_AMOUNT = 5.00;
    const invoiceAmount = parseFloat(invoice.amount);

    if (invoiceAmount < MINIMUM_BOLETO_AMOUNT) {
      logStep("Amount below minimum for boleto", { amount: invoiceAmount, minimum: MINIMUM_BOLETO_AMOUNT });
      throw new Error(`O valor mínimo para geração de boleto é R$ ${MINIMUM_BOLETO_AMOUNT.toFixed(2).replace('.', ',')}`);
    }

    // Get guardian data from teacher_student_relationships
    const { data: relationship, error: relationshipError } = await supabaseClient
      .from("teacher_student_relationships")
      .select("student_guardian_name, student_guardian_email, student_guardian_cpf, student_guardian_address_street, student_guardian_address_city, student_guardian_address_state, student_guardian_address_postal_code")
      .eq("teacher_id", invoice.teacher_id)
      .eq("student_id", invoice.student_id)
      .maybeSingle();

    if (relationshipError) {
      logStep("Error fetching guardian data", relationshipError);
    }

    // Check if student has complete profile data required for boleto
    const student = invoice.student;
    
    // Determine if we should use guardian or student data
    const hasGuardian = !!(relationship?.student_guardian_name);
    
    // Validate required data based on who will be the payer
    const payerCpf = hasGuardian && relationship?.student_guardian_cpf ? relationship.student_guardian_cpf : student.cpf;
    const payerAddressStreet = hasGuardian && relationship?.student_guardian_address_street ? relationship.student_guardian_address_street : student.address_street;
    const payerAddressCity = hasGuardian && relationship?.student_guardian_address_city ? relationship.student_guardian_address_city : student.address_city;
    const payerAddressState = hasGuardian && relationship?.student_guardian_address_state ? relationship.student_guardian_address_state : student.address_state;
    const payerAddressPostalCode = hasGuardian && relationship?.student_guardian_address_postal_code ? relationship.student_guardian_address_postal_code : student.address_postal_code;

    if (!payerCpf || !payerAddressStreet || !payerAddressCity || !payerAddressState || !payerAddressPostalCode) {
      const missingFields = [];
      if (!payerCpf) missingFields.push('CPF');
      if (!payerAddressStreet) missingFields.push('Endereço');
      if (!payerAddressCity) missingFields.push('Cidade');
      if (!payerAddressState) missingFields.push('Estado');
      if (!payerAddressPostalCode) missingFields.push('CEP');
      
      throw new Error(`Dados incompletos do ${hasGuardian ? 'responsável' : 'aluno'} - ${missingFields.join(', ')} obrigatório(s) para geração de boleto`);
    }

    logStep("Payer profile validated", { 
      studentId: student.id, 
      hasGuardian,
      hasCpf: !!payerCpf,
      hasAddress: !!(payerAddressStreet && payerAddressCity && payerAddressState && payerAddressPostalCode)
    });

    // Call create-payment-intent-connect to generate boleto
    const paymentData = {
      invoice_id: invoice_id,
      payment_method: "boleto",
      payer_tax_id: payerCpf,
      payer_name: relationship?.student_guardian_name || student.name,
      payer_email: relationship?.student_guardian_email || student.email,
      payer_address: {
        street: payerAddressStreet,
        city: payerAddressCity,
        state: payerAddressState,
        postal_code: payerAddressPostalCode
      }
    };

    logStep("Calling create-payment-intent-connect", paymentData);

    const paymentResponse = await supabaseClient.functions.invoke('create-payment-intent-connect', {
      body: paymentData
    });

    if (paymentResponse.error) {
      logStep("Error calling create-payment-intent-connect", paymentResponse.error);
      throw new Error(`Failed to generate boleto: ${paymentResponse.error.message}`);
    }

    logStep("Boleto generated successfully", {
      invoiceId: invoice_id,
      hasBoletoUrl: !!paymentResponse.data?.boleto_url,
      hasLinhaDigitavel: !!paymentResponse.data?.linha_digitavel
    });

    return new Response(JSON.stringify({
      success: true,
      invoice_id: invoice_id,
      boleto_url: paymentResponse.data?.boleto_url,
      linha_digitavel: paymentResponse.data?.linha_digitavel,
      payment_intent_id: paymentResponse.data?.payment_intent_id
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in generate-boleto-for-invoice", { message: errorMessage });
    return new Response(JSON.stringify({ 
      error: errorMessage, 
      success: false 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});