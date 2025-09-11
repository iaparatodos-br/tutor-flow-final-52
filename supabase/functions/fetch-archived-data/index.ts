import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ** Passo 1: Autenticação **
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // ** Passo 2: Receber Parâmetros **
    const { year, month } = await req.json();
    
    if (!year || !month) {
      return new Response(
        JSON.stringify({ 
          error: "Parâmetros obrigatórios: year, month" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log(`Buscando dados arquivados para usuário ${user.id}, período ${year}-${month}`);
    
    // ** Passo 3: Construir caminho do arquivo **
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const filePath = `${user.id}/${period}.json`;
    
    // Buscar arquivo no Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('archives')
      .download(filePath);

    // ** Passo 5: Tratamento de Erros (Arquivo não encontrado) **
    if (downloadError) {
      console.log(`Arquivo não encontrado: ${filePath}`, downloadError);
      return new Response(
        JSON.stringify({ 
          data: [],
          period: period,
          found: false,
          success: true
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Converter blob para texto e depois para JSON
    const textData = await fileData.text();
    const archivedData = JSON.parse(textData);
    
    console.log(`Dados arquivados encontrados para ${filePath}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: archivedData,
        period: period,
        found: true
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Erro ao buscar dados arquivados:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        found: false
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});