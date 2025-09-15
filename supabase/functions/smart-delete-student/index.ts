import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmartDeleteRequest {
  student_id: string;
  teacher_id: string;
  relationship_id: string;
}

interface SmartDeleteResponse {
  success: boolean;
  action: 'unlinked' | 'deleted';
  message: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { student_id, teacher_id, relationship_id }: SmartDeleteRequest = await req.json();

    // Validate required fields
    if (!student_id || !teacher_id || !relationship_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: student_id, teacher_id, relationship_id'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log('Smart delete request:', { student_id, teacher_id, relationship_id });

    // Check if student has other teacher relationships
    const { data: relationships, error: relationshipError } = await supabaseAdmin
      .from('teacher_student_relationships')
      .select('id, teacher_id')
      .eq('student_id', student_id);

    if (relationshipError) {
      console.error('Error checking relationships:', relationshipError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Error checking student relationships'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    console.log('Found relationships:', relationships);

    // Filter out the current relationship to see if there are others
    const otherRelationships = relationships?.filter(rel => rel.id !== relationship_id) || [];
    
    if (otherRelationships.length > 0) {
      // Student has other teachers - just unlink
      console.log('Student has other teachers, unlinking only');
      
      const { error: unlinkError } = await supabaseAdmin
        .from('teacher_student_relationships')
        .delete()
        .eq('id', relationship_id)
        .eq('teacher_id', teacher_id); // Additional security check

      if (unlinkError) {
        console.error('Error unlinking student:', unlinkError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Error removing student relationship'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'unlinked',
          message: 'Aluno desvinculado. Ele continuará disponível para outros professores.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    } else {
      // Student has no other teachers - delete completely
      console.log('Student has no other teachers, deleting completely');
      
      // First delete from auth.users (this will cascade to profiles due to foreign key)
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(student_id);
      
      if (authDeleteError) {
        console.error('Error deleting user from auth:', authDeleteError);
        
        // If auth deletion fails, try to delete profile directly
        console.log('Attempting to delete profile directly as fallback');
        
        const { error: profileDeleteError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', student_id);

        if (profileDeleteError) {
          console.error('Error deleting profile:', profileDeleteError);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Error deleting student permanently'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500 
            }
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'deleted',
          message: 'Aluno excluído permanentemente. O e-mail agora pode ser reutilizado.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }
    
  } catch (error) {
    console.error('Smart delete error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});