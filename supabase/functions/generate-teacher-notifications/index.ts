import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationToInsert {
  teacher_id: string
  source_type: 'class' | 'invoice'
  source_id: string
  category: 'pending_past_classes' | 'amnesty_eligible' | 'overdue_invoices' | 'pending_reports'
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[generate-teacher-notifications] Starting notification generation...')

    // Get all active teachers (professors with active/trialing subscriptions)
    const { data: teachers, error: teachersError } = await supabase
      .from('profiles')
      .select('id, subscription_status, current_plan_id')
      .eq('role', 'professor')
      .in('subscription_status', ['active', 'trialing'])

    if (teachersError) {
      console.error('[generate-teacher-notifications] Error fetching teachers:', teachersError)
      throw teachersError
    }

    console.log(`[generate-teacher-notifications] Found ${teachers?.length || 0} active teachers`)

    const notifications: NotificationToInsert[] = []
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

    // Get teacher plan names for feature gating
    const teacherPlanMap = new Map<string, string>()
    if (teachers && teachers.length > 0) {
      const planIds = [...new Set(teachers.filter(t => t.current_plan_id).map(t => t.current_plan_id))]
      if (planIds.length > 0) {
        const { data: plans } = await supabase
          .from('subscription_plans')
          .select('id, name')
          .in('id', planIds)
        
        if (plans) {
          for (const teacher of teachers) {
            const plan = plans.find(p => p.id === teacher.current_plan_id)
            if (plan) {
              teacherPlanMap.set(teacher.id, plan.name.toLowerCase())
            }
          }
        }
      }
    }

    // =====================================================
    // CATEGORY 1: pending_past_classes
    // Classes with status 'pendente' that are in the past
    // =====================================================
    const { data: pendingPastClasses, error: pendingError } = await supabase
      .from('classes')
      .select('id, teacher_id')
      .eq('status', 'pendente')
      .eq('is_experimental', false)
      .eq('is_template', false)
      .lt('class_date', new Date().toISOString())
      .gte('class_date', thirtyDaysAgoISO)

    if (pendingError) {
      console.error('[generate-teacher-notifications] Error fetching pending classes:', pendingError)
    } else if (pendingPastClasses) {
      console.log(`[generate-teacher-notifications] Found ${pendingPastClasses.length} pending past classes`)
      for (const cls of pendingPastClasses) {
        notifications.push({
          teacher_id: cls.teacher_id,
          source_type: 'class',
          source_id: cls.id,
          category: 'pending_past_classes',
        })
      }
    }

    // =====================================================
    // CATEGORY 2: amnesty_eligible
    // Classes that are cancelled with charge_applied=true and amnesty_granted=false
    // =====================================================
    const { data: amnestyEligible, error: amnestyError } = await supabase
      .from('classes')
      .select('id, teacher_id')
      .eq('status', 'cancelada')
      .eq('charge_applied', true)
      .eq('amnesty_granted', false)
      .eq('is_experimental', false)
      .eq('is_template', false)
      .gte('class_date', thirtyDaysAgoISO)

    // Track class IDs already added to avoid duplicates
    const amnestyClassIds = new Set<string>()

    if (amnestyError) {
      console.error('[generate-teacher-notifications] Error fetching amnesty eligible:', amnestyError)
    } else if (amnestyEligible) {
      console.log(`[generate-teacher-notifications] Found ${amnestyEligible.length} amnesty eligible classes`)
      for (const cls of amnestyEligible) {
        notifications.push({
          teacher_id: cls.teacher_id,
          source_type: 'class',
          source_id: cls.id,
          category: 'amnesty_eligible',
        })
        amnestyClassIds.add(cls.id)
      }
    }

    // =====================================================
    // CATEGORY 2B: amnesty_eligible from class_participants
    // For students who left group classes with charge_applied=true
    // (class itself is NOT cancelled, only the participant)
    // =====================================================
    const { data: amnestyParticipants, error: amnestyPartError } = await supabase
      .from('class_participants')
      .select('class_id')
      .eq('status', 'cancelada')
      .eq('charge_applied', true)
      .gte('created_at', thirtyDaysAgoISO)

    if (amnestyPartError) {
      console.error('[generate-teacher-notifications] Error fetching amnesty from participants:', amnestyPartError)
    } else if (amnestyParticipants && amnestyParticipants.length > 0) {
      // Get unique class IDs from participants
      const participantClassIds = [...new Set(amnestyParticipants.map(p => p.class_id))]
      
      // Filter out classes already added and fetch class details
      const classIdsToCheck = participantClassIds.filter(id => !amnestyClassIds.has(id))
      
      if (classIdsToCheck.length > 0) {
        const { data: groupClasses, error: groupError } = await supabase
          .from('classes')
          .select('id, teacher_id, status, amnesty_granted, class_date')
          .in('id', classIdsToCheck)
          .neq('status', 'cancelada')
          .eq('amnesty_granted', false)
          .gte('class_date', thirtyDaysAgoISO)

        if (groupError) {
          console.error('[generate-teacher-notifications] Error fetching group classes for amnesty:', groupError)
        } else if (groupClasses) {
          console.log(`[generate-teacher-notifications] Found ${groupClasses.length} amnesty eligible from group class participants`)
          for (const cls of groupClasses) {
            if (!amnestyClassIds.has(cls.id)) {
              notifications.push({
                teacher_id: cls.teacher_id,
                source_type: 'class',
                source_id: cls.id,
                category: 'amnesty_eligible',
              })
              amnestyClassIds.add(cls.id)
            }
          }
        }
      }
    }

    // =====================================================
    // CATEGORY 3: overdue_invoices
    // Invoices with status 'overdue' OR calculated as overdue (due_date < today)
    // Must have business_profile_id (financial features enabled)
    // =====================================================
    
    // Query 1: Physical overdue status
    const { data: overdueInvoices1, error: overdueError1 } = await supabase
      .from('invoices')
      .select('id, teacher_id')
      .eq('status', 'overdue')
      .not('business_profile_id', 'is', null)
      .gte('created_at', thirtyDaysAgoISO)

    // Query 2: Calculated overdue (pending invoices past due date)
    const today = new Date().toISOString().split('T')[0]
    const { data: overdueInvoices2, error: overdueError2 } = await supabase
      .from('invoices')
      .select('id, teacher_id')
      .eq('status', 'pendente')
      .lt('due_date', today)
      .not('business_profile_id', 'is', null)
      .gte('created_at', thirtyDaysAgoISO)

    if (overdueError1) {
      console.error('[generate-teacher-notifications] Error fetching overdue invoices (status):', overdueError1)
    }
    if (overdueError2) {
      console.error('[generate-teacher-notifications] Error fetching overdue invoices (calculated):', overdueError2)
    }

    // Merge and deduplicate
    const overdueInvoiceMap = new Map<string, { id: string; teacher_id: string }>()
    if (overdueInvoices1) {
      for (const inv of overdueInvoices1) {
        overdueInvoiceMap.set(inv.id, inv)
      }
    }
    if (overdueInvoices2) {
      for (const inv of overdueInvoices2) {
        overdueInvoiceMap.set(inv.id, inv)
      }
    }

    const overdueInvoices = Array.from(overdueInvoiceMap.values())
    console.log(`[generate-teacher-notifications] Found ${overdueInvoices.length} overdue invoices (merged)`)
    
    for (const inv of overdueInvoices) {
      notifications.push({
        teacher_id: inv.teacher_id,
        source_type: 'invoice',
        source_id: inv.id,
        category: 'overdue_invoices',
      })
    }

    // =====================================================
    // CATEGORY 4: pending_reports
    // Completed classes without a class_report
    // Only for teachers with professional/premium plans
    // =====================================================
    const { data: completedClasses, error: completedError } = await supabase
      .from('classes')
      .select('id, teacher_id')
      .eq('status', 'concluida')
      .eq('is_experimental', false)
      .eq('is_template', false)
      .gte('class_date', thirtyDaysAgoISO)

    if (completedError) {
      console.error('[generate-teacher-notifications] Error fetching completed classes:', completedError)
    } else if (completedClasses && completedClasses.length > 0) {
      // Get existing reports
      const classIds = completedClasses.map(c => c.id)
      const { data: existingReports, error: reportsError } = await supabase
        .from('class_reports')
        .select('class_id')
        .in('class_id', classIds)

      if (reportsError) {
        console.error('[generate-teacher-notifications] Error fetching existing reports:', reportsError)
      } else {
        const reportedClassIds = new Set(existingReports?.map(r => r.class_id) || [])
        
        for (const cls of completedClasses) {
          // Only add if:
          // 1. No report exists
          // 2. Teacher has professional or premium plan
          if (!reportedClassIds.has(cls.id)) {
            const planName = teacherPlanMap.get(cls.teacher_id) || ''
            if (planName.includes('professional') || planName.includes('premium')) {
              notifications.push({
                teacher_id: cls.teacher_id,
                source_type: 'class',
                source_id: cls.id,
                category: 'pending_reports',
              })
            }
          }
        }
      }
    }

    console.log(`[generate-teacher-notifications] Total notifications to upsert: ${notifications.length}`)

    // =====================================================
    // UPSERT NOTIFICATIONS (using ON CONFLICT DO NOTHING)
    // =====================================================
    if (notifications.length > 0) {
      // Batch insert with conflict handling
      const { error: insertError } = await supabase
        .from('teacher_notifications')
        .upsert(
          notifications.map(n => ({
            teacher_id: n.teacher_id,
            source_type: n.source_type,
            source_id: n.source_id,
            category: n.category,
            status: 'inbox',
            is_read: false,
            created_at: new Date().toISOString(),
          })),
          {
            onConflict: 'teacher_id,source_type,source_id,category',
            ignoreDuplicates: true,
          }
        )

      if (insertError) {
        console.error('[generate-teacher-notifications] Error inserting notifications:', insertError)
      } else {
        console.log('[generate-teacher-notifications] Notifications upserted successfully')
      }
    }

    // =====================================================
    // CLEANUP: Remove 'done' notifications older than 30 days
    // =====================================================
    const { error: cleanupError } = await supabase
      .from('teacher_notifications')
      .delete()
      .eq('status', 'done')
      .lt('status_changed_at', thirtyDaysAgoISO)

    if (cleanupError) {
      console.error('[generate-teacher-notifications] Error during cleanup:', cleanupError)
    } else {
      console.log('[generate-teacher-notifications] Cleanup completed')
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_processed: notifications.length,
        teachers_checked: teachers?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('[generate-teacher-notifications] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
