import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;

    const { 
      original_class_id, 
      from_date, 
      action, 
      newData,
      end_date // Optional: if provided, only affect occurrences until this date
    } = await req.json();
    
    if (!original_class_id || !from_date || !action) {
      throw new Error("Missing required fields: original_class_id, from_date, action");
    }

    // Validate that the user owns the original class
    const { data: originalClass, error: classError } = await supabase
      .from('classes')
      .select('id, teacher_id, recurrence_pattern, class_date')
      .eq('id', original_class_id)
      .eq('teacher_id', user.id)
      .maybeSingle();

    if (classError) throw classError;
    if (!originalClass) throw new Error("Class not found or access denied");
    if (!originalClass.recurrence_pattern) throw new Error("Class is not recurring");

    // Parse the recurrence pattern to generate future dates
    const startDate = new Date(from_date);
    const endDate = end_date ? new Date(end_date) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now if no end date
    
    // Generate future occurrence dates based on recurrence pattern
    const recurrencePattern = originalClass.recurrence_pattern as any;
    const frequency = recurrencePattern.frequency;
    const originalDate = new Date(originalClass.class_date);
    
    const futureOccurrences = [];
    let currentDate = new Date(startDate);
    
    // Generate up to 1000 occurrences to prevent infinite loops
    let maxOccurrences = 1000;
    let count = 0;
    
    while (currentDate <= endDate && count < maxOccurrences) {
      futureOccurrences.push(new Date(currentDate));
      
      // Increment based on frequency
      switch (frequency) {
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'biweekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
        default:
          throw new Error(`Unsupported frequency: ${frequency}`);
      }
      count++;
    }

    console.log(`Generated ${futureOccurrences.length} future occurrences to process`);

    // Create exceptions for all future occurrences
    const exceptions = futureOccurrences.map(date => {
      let exceptionData: any = {
        original_class_id,
        exception_date: date.toISOString(),
      };

      if (action === 'cancel') {
        exceptionData.status = 'canceled';
      } else if (action === 'reschedule') {
        if (!newData) throw new Error("newData is required for reschedule action");
        
        // Calculate the offset between original date and the new date for the first occurrence
        const originalFirstDate = new Date(from_date);
        const newFirstDate = new Date(newData.start_time);
        const timeOffset = newFirstDate.getTime() - originalFirstDate.getTime();
        
        // Apply the same offset to this occurrence
        const newOccurrenceDate = new Date(date.getTime() + timeOffset);
        const newEndTime = new Date(newOccurrenceDate.getTime() + (newData.duration_minutes * 60 * 1000));
        
        exceptionData.status = 'rescheduled';
        exceptionData.new_start_time = newOccurrenceDate.toISOString();
        exceptionData.new_end_time = newEndTime.toISOString();
        exceptionData.new_title = newData.title;
        exceptionData.new_description = newData.description;
        exceptionData.new_duration_minutes = newData.duration_minutes;
      } else {
        throw new Error("Invalid action. Must be 'cancel' or 'reschedule'");
      }

      return exceptionData;
    });

    // Batch insert exceptions
    if (exceptions.length > 0) {
      const { data: insertedExceptions, error: exceptionError } = await supabase
        .from('class_exceptions')
        .upsert(exceptions, { 
          onConflict: 'original_class_id,exception_date',
          ignoreDuplicates: false 
        })
        .select();

      if (exceptionError) throw exceptionError;

      console.log(`Successfully created ${insertedExceptions?.length || 0} exceptions`);
    }

    const actionText = action === 'cancel' ? 'canceladas' : 'reagendadas';
    const message = `${futureOccurrences.length} aulas futuras foram ${actionText} com sucesso`;

    return new Response(JSON.stringify({ 
      success: true, 
      affected_count: futureOccurrences.length,
      message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error('Error in manage-future-class-exceptions:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});