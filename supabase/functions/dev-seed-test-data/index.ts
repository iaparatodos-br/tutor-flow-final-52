import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SeedResult {
  success: boolean
  message: string
  data?: {
    subscription_id?: string
    student_subscription_id?: string
    classes_created?: number
  }
  error?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[dev-seed-test-data] Starting seed process...')

    // Verificar que estamos em desenvolvimento
    const isDev = Deno.env.get('ENVIRONMENT') !== 'production'
    if (!isDev) {
      console.warn('[dev-seed-test-data] Attempted to run in production!')
      return new Response(
        JSON.stringify({ success: false, error: 'Esta função só pode ser executada em desenvolvimento' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Obter usuário autenticado
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se é professor
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'professor') {
      return new Response(
        JSON.stringify({ success: false, error: 'Apenas professores podem criar dados de teste' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const action = body.action || 'create_subscription'

    console.log(`[dev-seed-test-data] Action: ${action}, Teacher: ${user.id}`)

    let result: SeedResult = { success: false, message: '' }

    switch (action) {
      case 'create_subscription': {
        // Criar mensalidade de teste
        const { data: subscription, error: subError } = await supabase
          .from('monthly_subscriptions')
          .insert({
            teacher_id: user.id,
            name: `Plano Teste E2E - ${new Date().toISOString().slice(0, 10)}`,
            description: 'Plano criado automaticamente para testes de integração',
            price: 200.00,
            max_classes: 4,
            overage_price: 50.00,
            is_active: true
          })
          .select('id')
          .single()

        if (subError) {
          console.error('[dev-seed-test-data] Error creating subscription:', subError)
          result = { success: false, message: 'Erro ao criar mensalidade', error: subError.message }
        } else {
          console.log('[dev-seed-test-data] Subscription created:', subscription.id)
          result = { 
            success: true, 
            message: 'Mensalidade de teste criada com sucesso!',
            data: { subscription_id: subscription.id }
          }
        }
        break
      }

      case 'assign_student': {
        const { subscription_id, relationship_id } = body

        if (!subscription_id || !relationship_id) {
          result = { success: false, message: 'subscription_id e relationship_id são obrigatórios' }
          break
        }

        // Verificar se já existe atribuição ativa
        const { data: existing } = await supabase
          .from('student_monthly_subscriptions')
          .select('id')
          .eq('relationship_id', relationship_id)
          .eq('is_active', true)
          .single()

        if (existing) {
          result = { success: false, message: 'Aluno já possui uma mensalidade ativa' }
          break
        }

        const { data: assignment, error: assignError } = await supabase
          .from('student_monthly_subscriptions')
          .insert({
            subscription_id,
            relationship_id,
            starts_at: new Date().toISOString().slice(0, 10),
            is_active: true
          })
          .select('id')
          .single()

        if (assignError) {
          console.error('[dev-seed-test-data] Error assigning student:', assignError)
          result = { success: false, message: 'Erro ao vincular aluno', error: assignError.message }
        } else {
          console.log('[dev-seed-test-data] Student assigned:', assignment.id)
          result = { 
            success: true, 
            message: 'Aluno vinculado com sucesso!',
            data: { student_subscription_id: assignment.id }
          }
        }
        break
      }

      case 'create_test_classes': {
        const { student_id, count = 3 } = body

        if (!student_id) {
          result = { success: false, message: 'student_id é obrigatório' }
          break
        }

        // Buscar serviço padrão do professor
        const { data: service } = await supabase
          .from('class_services')
          .select('id')
          .eq('teacher_id', user.id)
          .eq('is_active', true)
          .limit(1)
          .single()

        if (!service) {
          result = { success: false, message: 'Professor não possui serviço configurado' }
          break
        }

        let classesCreated = 0
        for (let i = 0; i < count; i++) {
          const classDate = new Date()
          classDate.setDate(classDate.getDate() - i)

          // Criar aula
          const { data: classData, error: classError } = await supabase
            .from('classes')
            .insert({
              teacher_id: user.id,
              class_date: classDate.toISOString(),
              duration_minutes: 60,
              status: 'concluida',
              service_id: service.id,
              is_experimental: false,
              is_group_class: false,
              is_template: false
            })
            .select('id')
            .single()

          if (classError) {
            console.error(`[dev-seed-test-data] Error creating class ${i + 1}:`, classError)
            continue
          }

          // Criar participante
          const { error: participantError } = await supabase
            .from('class_participants')
            .insert({
              class_id: classData.id,
              student_id: student_id,
              status: 'concluida'
            })

          if (!participantError) {
            classesCreated++
          }
        }

        console.log(`[dev-seed-test-data] Created ${classesCreated} classes`)
        result = { 
          success: true, 
          message: `${classesCreated} aulas de teste criadas!`,
          data: { classes_created: classesCreated }
        }
        break
      }

      case 'get_available_data': {
        // Retornar dados disponíveis para teste
        const { data: subscriptions } = await supabase
          .from('monthly_subscriptions')
          .select('id, name, is_active')
          .eq('teacher_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5)

        const { data: relationships } = await supabase
          .from('teacher_student_relationships')
          .select(`
            id,
            student_id,
            student_name,
            profiles!inner(name, email)
          `)
          .eq('teacher_id', user.id)
          .limit(10)

        result = {
          success: true,
          message: 'Dados disponíveis carregados',
          data: {
            subscriptions,
            relationships
          } as any
        }
        break
      }

      case 'cleanup': {
        // Limpar dados de teste
        const { error: cleanupError } = await supabase
          .from('monthly_subscriptions')
          .update({ is_active: false })
          .eq('teacher_id', user.id)
          .ilike('name', 'Plano Teste%')

        if (cleanupError) {
          result = { success: false, message: 'Erro ao limpar dados', error: cleanupError.message }
        } else {
          result = { success: true, message: 'Dados de teste limpos com sucesso!' }
        }
        break
      }

      default:
        result = { success: false, message: `Ação desconhecida: ${action}` }
    }

    console.log('[dev-seed-test-data] Result:', result)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[dev-seed-test-data] Unexpected error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
