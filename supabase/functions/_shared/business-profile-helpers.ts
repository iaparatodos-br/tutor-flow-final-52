// Helper function to verify business profile ownership
// This function should be imported and used in all Edge Functions that need business_profile_id validation

export async function verifyBusinessProfileOwnership(
  supabaseClient: any,
  authHeader: string | null,
  businessProfileId: string
): Promise<{ success: boolean; user?: any; error?: string }> {
  if (!authHeader) {
    return { success: false, error: "No authorization header provided" };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
  
  if (userError || !userData.user) {
    return { success: false, error: "Authentication failed" };
  }

  // Verify business profile ownership
  const { data: businessProfile, error: businessProfileError } = await supabaseClient
    .from('business_profiles')
    .select('id, user_id, business_name, is_active')
    .eq('id', businessProfileId)
    .eq('user_id', userData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (businessProfileError || !businessProfile) {
    return { 
      success: false, 
      error: "Business profile not found or doesn't belong to user" 
    };
  }

  return { success: true, user: userData.user };
}

// Helper function to get business profiles for a user
export async function getUserBusinessProfiles(
  supabaseClient: any,
  userId: string
): Promise<{ success: boolean; profiles?: any[]; error?: string }> {
  const { data: businessProfiles, error } = await supabaseClient
    .from('business_profiles')
    .select(`
      id,
      business_name,
      cnpj,
      stripe_connect_id,
      is_active,
      created_at
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, profiles: businessProfiles || [] };
}