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
  dependent_id?: string; // Novo campo para suporte a dependentes
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

    // ========== NOVO: Resolução automática de dependente → responsável ==========
    let billingStudentId = body.student_id;
    let dependentId: string | null = body.dependent_id || null;
    let dependentName: string | null = null;

    // Verificar se o student_id é na verdade um dependente
    // Se for, resolver para o responsible_id automaticamente
    const { data: dependentCheck, error: dependentCheckError } = await supabaseClient
      .from('dependents')
      .select('id, name, responsible_id, teacher_id')
      .eq('id', body.student_id)
      .eq('teacher_id', user.id)
      .maybeSingle();

    if (!dependentCheckError && dependentCheck) {
      // O "student_id" fornecido é na verdade um dependente
      // Redirecionar cobrança para o responsável
      logStep("Detected dependent as student_id - redirecting to responsible", {
        dependentId: dependentCheck.id,
        dependentName: dependentCheck.name,
        responsibleId: dependentCheck.responsible_id
      });
      
      billingStudentId = dependentCheck.responsible_id;
      dependentId = dependentCheck.id;
      dependentName = dependentCheck.name;
    } else if (body.dependent_id) {
      // dependent_id foi fornecido explicitamente, verificar se é válido
      const { data: explicitDependent, error: explicitDepError } = await supabaseClient
        .from('dependents')
        .select('id, name, responsible_id, teacher_id')
        .eq('id', body.dependent_id)
        .eq('teacher_id', user.id)
        .maybeSingle();

      if (!explicitDepError && explicitDependent) {
        // Verificar se o responsible_id corresponde ao student_id
        if (explicitDependent.responsible_id !== body.student_id) {
          logStep("WARNING: dependent_id provided does not belong to student_id", {
            dependentResponsible: explicitDependent.responsible_id,
            providedStudent: body.student_id
          });
          // Corrigir automaticamente
          billingStudentId = explicitDependent.responsible_id;
        }
        dependentId = explicitDependent.id;
        dependentName = explicitDependent.name;
        logStep("Explicit dependent_id resolved", {
          dependentId,
          dependentName,
          billingTo: billingStudentId
        });
      } else {
        logStep("WARNING: dependent_id provided not found or not accessible", { 
          dependentId: body.dependent_id 
        });
        // Continuar sem dependente
        dependentId = null;
      }
    }

    logStep("Billing resolution complete", {
      originalStudentId: body.student_id,
      billingStudentId,
      dependentId,
      dependentName
    });

    // Get the business_profile_id from teacher_student_relationships
    // Usar billingStudentId (responsável) em vez de body.student_id
    const { data: relationship, error: relationshipError } = await supabaseClient
      .from('teacher_student_relationships')
      .select('business_profile_id, teacher_id')
      .eq('student_id', billingStudentId)
      .eq('teacher_id', user.id)
      .single();

    if (relationshipError || !relationship) {
      logStep("Relationship not found", { error: relationshipError, billingStudentId });
      throw new Error("Relacionamento professor-aluno não encontrado");
    }

    // Validate that business_profile_id is not null
    if (!relationship.business_profile_id) {
      logStep("No business profile defined for student", { studentId: billingStudentId });
      // Return status 200 with success: false to allow frontend to display error properly
      return new Response(JSON.stringify({
        success: false,
        error: "Por favor, defina um negócio de recebimento para este aluno em seu cadastro antes de gerar uma fatura."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Business profile found", { 
      businessProfileId: relationship.business_profile_id,
      studentId: billingStudentId 
    });

    // Calculate due date if not provided
    const dueDate = body.due_date || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 15 days from now

    // Criar descrição com nome do dependente se aplicável
    let invoiceDescription = body.description || 'Fatura manual';
    if (dependentName && !invoiceDescription.includes(dependentName)) {
      invoiceDescription = `[${dependentName}] ${invoiceDescription}`;
    }

    // Create the invoice with business_profile_id
    // A fatura é sempre para o responsável (billingStudentId)
    const invoiceData = {
      student_id: billingStudentId, // Sempre o responsável
      teacher_id: user.id,
      amount: body.amount,
      description: invoiceDescription,
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
      businessProfileId: relationship.business_profile_id,
      billedTo: billingStudentId,
      forDependent: dependentId
    });

    // Update classes if class_ids provided
    if (body.class_ids && body.class_ids.length > 0) {
      // Buscar dados das aulas e participantes
      // Considerar tanto participantes do aluno quanto de dependentes
      const { data: classData, error: classDataError } = await supabaseClient
        .from('class_participants')
        .select(`
          id,
          class_id,
          student_id,
          dependent_id,
          classes!inner (
            id,
            class_date,
            service_id,
            class_services (name, price)
          )
        `)
        .in('class_id', body.class_ids)
        .or(`student_id.eq.${billingStudentId},dependent_id.not.is.null`);

      if (classDataError) {
        logStep("ERROR: Failed to fetch class data for invoice_classes", { error: classDataError });
        // Rollback: delete the invoice that was just created
        await supabaseClient.from('invoices').delete().eq('id', newInvoice.id);
        throw new Error(`Erro ao buscar dados das aulas: ${classDataError.message}`);
      }

      // Filtrar participantes que pertencem ao responsável ou seus dependentes
      let filteredClassData = classData || [];
      if (dependentId) {
        // Se há um dependente específico, filtrar apenas aulas desse dependente
        filteredClassData = filteredClassData.filter(cp => cp.dependent_id === dependentId);
      } else {
        // Se não, incluir aulas do aluno e de todos os seus dependentes
        // Primeiro buscar dependentes do responsável
        const { data: responsibleDependents } = await supabaseClient
          .from('dependents')
          .select('id')
          .eq('responsible_id', billingStudentId)
          .eq('teacher_id', user.id);
        
        const dependentIds = responsibleDependents?.map(d => d.id) || [];
        
        filteredClassData = filteredClassData.filter(cp => 
          cp.student_id === billingStudentId || 
          (cp.dependent_id && dependentIds.includes(cp.dependent_id))
        );
      }

      if (filteredClassData.length === 0) {
        logStep("ERROR: No class data found for the provided class_ids");
        // Rollback: delete the invoice that was just created
        await supabaseClient.from('invoices').delete().eq('id', newInvoice.id);
        throw new Error('Nenhuma aula encontrada para os IDs fornecidos');
      }

      // Buscar nomes dos dependentes para descrição
      const dependentIdsInClasses = [...new Set(
        filteredClassData.filter(cp => cp.dependent_id).map(cp => cp.dependent_id)
      )];
      
      let dependentNamesMap: Record<string, string> = {};
      if (dependentIdsInClasses.length > 0) {
        const { data: dependentsData } = await supabaseClient
          .from('dependents')
          .select('id, name')
          .in('id', dependentIdsInClasses);
        
        if (dependentsData) {
          dependentNamesMap = Object.fromEntries(
            dependentsData.map(d => [d.id, d.name])
          );
        }
      }

      // Preparar itens para invoice_classes
      const invoiceItems = [];
      let calculatedTotal = 0;
      
      for (const cp of filteredClassData) {
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
          itemAmount = body.amount / filteredClassData.length;
        }
        
        calculatedTotal += itemAmount;
        
        // Descrição com nome do dependente se aplicável
        let itemDescription = `${service?.name || 'Aula'} - ${new Date(classInfo.class_date).toLocaleDateString('pt-BR')}`;
        if (cp.dependent_id && dependentNamesMap[cp.dependent_id]) {
          itemDescription = `[${dependentNamesMap[cp.dependent_id]}] ${itemDescription}`;
        }
        
        invoiceItems.push({
          invoice_id: newInvoice.id,
          class_id: cp.class_id,
          participant_id: cp.id,
          item_type: body.invoice_type === 'cancellation' ? 'cancellation_charge' : 'completed_class',
          amount: itemAmount,
          description: itemDescription,
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
      
      logStep("Invoice items created successfully", { 
        itemCount: invoiceItems.length,
        dependentItemsCount: invoiceItems.filter(i => i.description.startsWith('[')).length
      });
    }

    // Generate payment URL automatically
    logStep("Generating payment URL", { invoiceId: newInvoice.id });
    try {
      // Fetch guardian data from relationship for better logging
      const { data: relationshipData, error: relError } = await supabaseClient
        .from('teacher_student_relationships')
        .select('student_guardian_cpf, student_guardian_name, student_guardian_email, student_guardian_phone, student_guardian_address_street, student_guardian_address_city, student_guardian_address_state, student_guardian_address_postal_code')
        .eq('student_id', billingStudentId)
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
      message: 'Fatura criada com sucesso',
      billing_info: {
        billed_to: billingStudentId,
        for_dependent: dependentId,
        dependent_name: dependentName
      }
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
