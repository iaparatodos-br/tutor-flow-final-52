import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-INVOICE] ${step}${detailsStr}`);
};

interface CreateInvoiceRequest {
  student_id: string;
  amount: number;
  description?: string;
  due_date?: string;
  class_ids?: string[];
  invoice_type?: string;
  class_id?: string;
  original_amount?: number;
  cancellation_policy_id?: string;
}

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const body: CreateInvoiceRequest = await req.json();
    
    if (!body.student_id || !body.amount) {
      throw new Error("student_id and amount are required");
    }
    
    logStep("Request data", body);

    // Get the business_profile_id from teacher_student_relationships
    const { data: relationship, error: relationshipError } = await supabaseClient
      .from('teacher_student_relationships')
      .select('business_profile_id, teacher_id')
      .eq('student_id', body.student_id)
      .eq('teacher_id', user.id)
      .single();

    if (relationshipError || !relationship) {
      logStep("Relationship not found", { error: relationshipError });
      throw new Error("Relacionamento professor-aluno não encontrado");
    }

    // Validate that business_profile_id is not null
    if (!relationship.business_profile_id) {
      logStep("No business profile defined for student", { studentId: body.student_id });
      return new Response(JSON.stringify({
        success: false,
        error: "Por favor, defina um negócio de recebimento para este aluno em seu cadastro antes de gerar uma fatura."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    logStep("Business profile found", { 
      businessProfileId: relationship.business_profile_id,
      studentId: body.student_id 
    });

    // Calculate due date if not provided
    const dueDate = body.due_date || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 15 days from now

    // Create the invoice with business_profile_id
    const invoiceData = {
      student_id: body.student_id,
      teacher_id: user.id,
      amount: body.amount,
      description: body.description || 'Fatura manual',
      due_date: dueDate,
      status: 'pendente' as const,
      invoice_type: body.invoice_type || 'manual',
      business_profile_id: relationship.business_profile_id,
      ...(body.class_id && { class_id: body.class_id }),
      ...(body.original_amount && { original_amount: body.original_amount }),
      ...(body.cancellation_policy_id && { cancellation_policy_id: body.cancellation_policy_id }),
    };

    const { data: newInvoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (invoiceError) {
      logStep("Error creating invoice", { error: invoiceError });
      throw new Error(`Erro ao criar fatura: ${invoiceError.message}`);
    }

    logStep("Invoice created successfully", { 
      invoiceId: newInvoice.id,
      businessProfileId: relationship.business_profile_id 
    });

    // Update classes if class_ids provided
    if (body.class_ids && body.class_ids.length > 0) {
      // Buscar dados das aulas e participantes
      const { data: classData, error: classDataError } = await supabaseClient
        .from('class_participants')
        .select(`
          id,
          class_id,
          classes!inner (
            id,
            class_date,
            service_id,
            class_services (name, price)
          )
        `)
        .in('class_id', body.class_ids)
        .eq('student_id', body.student_id);

      if (classDataError) {
        logStep("ERROR: Failed to fetch class data for invoice_classes", { error: classDataError });
        // Rollback: delete the invoice that was just created
        await supabaseClient.from('invoices').delete().eq('id', newInvoice.id);
        throw new Error(`Erro ao buscar dados das aulas: ${classDataError.message}`);
      }

      if (!classData || classData.length === 0) {
        logStep("ERROR: No class data found for the provided class_ids");
        // Rollback: delete the invoice that was just created
        await supabaseClient.from('invoices').delete().eq('id', newInvoice.id);
        throw new Error('Nenhuma aula encontrada para os IDs fornecidos');
      }

      // Preparar itens para invoice_classes
      const invoiceItems = [];
      let calculatedTotal = 0;
      
      for (const cp of classData) {
        const classInfo = Array.isArray(cp.classes) ? cp.classes[0] : cp.classes;
        const service = Array.isArray(classInfo.class_services) 
          ? classInfo.class_services[0] 
          : classInfo.class_services;
        
        // Calcular valor proporcional
        let itemAmount: number;
        if (service?.price) {
          // Se tem preço do serviço, usar ele
          itemAmount = Number(service.price);
        } else {
          // Se não tem preço, dividir proporcionalmente
          itemAmount = body.amount / classData.length;
        }
        
        calculatedTotal += itemAmount;
        
        invoiceItems.push({
          invoice_id: newInvoice.id,
          class_id: cp.class_id,
          participant_id: cp.id,
          item_type: body.invoice_type === 'cancellation' ? 'cancellation_charge' : 'completed_class',
          amount: itemAmount,
          description: `${service?.name || 'Aula'} - ${new Date(classInfo.class_date).toLocaleDateString('pt-BR')}`,
          cancellation_policy_id: body.cancellation_policy_id || null,
          charge_percentage: body.invoice_type === 'cancellation' && body.original_amount 
            ? ((body.amount / body.original_amount) * 100) 
            : null
        });
      }
      
      // Ajustar o último item se houver diferença de arredondamento
      if (Math.abs(calculatedTotal - body.amount) > 0.01) {
        const diff = body.amount - calculatedTotal;
        invoiceItems[invoiceItems.length - 1].amount += diff;
        logStep("Adjusted last item amount for rounding", { diff });
      }
      
      // Inserir itens em invoice_classes
      const { error: itemsError } = await supabaseClient
        .from('invoice_classes')
        .insert(invoiceItems);
      
      if (itemsError) {
        logStep("ERROR: Failed to create invoice items", { error: itemsError });
        // Rollback: delete the invoice that was just created
        await supabaseClient.from('invoices').delete().eq('id', newInvoice.id);
        throw new Error(`Erro ao criar itens da fatura: ${itemsError.message}`);
      }
      
      logStep("Invoice items created successfully", { itemCount: invoiceItems.length });
    }

    // Generate payment URL automatically
    logStep("Generating payment URL", { invoiceId: newInvoice.id });
    try {
      // Fetch guardian data from relationship for better logging
      const { data: relationshipData, error: relError } = await supabaseClient
        .from('teacher_student_relationships')
        .select('student_guardian_cpf, student_guardian_name, student_guardian_email, student_guardian_phone, student_guardian_address_street, student_guardian_address_city, student_guardian_address_state, student_guardian_address_postal_code')
        .eq('student_id', body.student_id)
        .eq('teacher_id', user.id)
        .single();
      
      logStep('Guardian data from relationship', {
        hasRelationshipData: !!relationshipData,
        hasGuardianCpf: !!relationshipData?.student_guardian_cpf,
        hasGuardianName: !!relationshipData?.student_guardian_name,
        hasGuardianAddress: !!(relationshipData?.student_guardian_address_street && relationshipData?.student_guardian_address_city),
        guardianCpf: relationshipData?.student_guardian_cpf ? `***${String(relationshipData.student_guardian_cpf).slice(-4)}` : 'none'
      });
      
      const { data: paymentResult, error: paymentError } = await supabaseClient.functions.invoke(
        'create-payment-intent-connect',
        {
          body: {
            invoice_id: newInvoice.id,
            payment_method: 'boleto' // Default to boleto for automatic generation
          },
          headers: {
            Authorization: authHeader
          }
        }
      );

      logStep("Payment intent response", { 
        status: paymentError ? 'error' : 'success',
        hasData: !!paymentResult,
        hasBoletoUrl: !!paymentResult?.boleto_url,
        hasLinhaDigitavel: !!paymentResult?.linha_digitavel,
        errorMessage: paymentError?.message,
        errorDetails: paymentError
      });

      if (!paymentError && paymentResult?.boleto_url) {
        // Update invoice with the generated payment URL
        const { error: updateError } = await supabaseClient
          .from('invoices')
          .update({ 
            stripe_hosted_invoice_url: paymentResult.boleto_url,
            boleto_url: paymentResult.boleto_url,
            linha_digitavel: paymentResult.linha_digitavel,
            stripe_payment_intent_id: paymentResult.payment_intent_id
          })
          .eq('id', newInvoice.id);

        if (!updateError) {
          logStep("Payment URL generated and saved", { 
            invoiceId: newInvoice.id,
            paymentUrl: paymentResult.boleto_url 
          });
          
          // Update the invoice object to return the complete data
          newInvoice.stripe_hosted_invoice_url = paymentResult.boleto_url;
          newInvoice.boleto_url = paymentResult.boleto_url;
          newInvoice.linha_digitavel = paymentResult.linha_digitavel;
          newInvoice.stripe_payment_intent_id = paymentResult.payment_intent_id;
        } else {
          logStep("Warning: Could not update invoice with payment URL", { error: updateError });
        }
      } else {
        logStep("Warning: Could not generate payment URL", { 
          error: paymentError,
          hasResult: !!paymentResult,
          resultData: paymentResult
        });
      }
    } catch (paymentGenerationError: any) {
      logStep("Warning: Failed to generate payment URL", { 
        error: paymentGenerationError.message,
        stack: paymentGenerationError.stack
      });
      // Continue without failing the invoice creation
    }

    // Enviar notificação de fatura criada (não-bloqueante)
    supabaseClient.functions
      .invoke('send-invoice-notification', {
        body: {
          invoice_id: newInvoice.id,
          notification_type: 'invoice_created'
        }
      })
      .then(({ error: notifError }) => {
        if (notifError) {
          console.error('Error sending invoice notification (non-critical):', notifError);
        } else {
          logStep('Invoice notification sent successfully');
        }
      })
      .catch((err) => {
        console.error('Error invoking notification function (non-critical):', err);
      });

    return new Response(JSON.stringify({
      success: true,
      invoice: newInvoice,
      message: 'Fatura criada com sucesso'
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-invoice", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});