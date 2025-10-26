-- Criar bucket público para documentos legais
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legal_documents',
  'legal_documents',
  true,
  10485760, -- 10MB limite por arquivo
  ARRAY['application/pdf']::text[]
);

-- Política RLS: Permitir leitura pública de todos os arquivos
CREATE POLICY "Public read access for legal documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'legal_documents');

-- Política RLS: Apenas service_role pode fazer upload/update/delete
CREATE POLICY "Service role can manage legal documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'legal_documents' 
  AND auth.role() = 'service_role'
);

-- Criar tabela para metadados dos documentos legais
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  document_type TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_legal_documents_active ON public.legal_documents(is_active, display_order);
CREATE INDEX idx_legal_documents_type ON public.legal_documents(document_type);

-- Trigger para updated_at
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: Leitura pública
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for legal documents"
  ON public.legal_documents
  FOR SELECT
  USING (is_active = true);

-- RLS: Apenas service_role pode modificar
CREATE POLICY "Service role can manage legal documents"
  ON public.legal_documents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Popular tabela com dados iniciais
INSERT INTO public.legal_documents (title, description, file_name, version, document_type, display_order, published_at)
VALUES
  (
    'Termos de Uso da Plataforma',
    'Documento principal que estabelece as regras de utilização da Plataforma Tutor Flow, incluindo responsabilidades, limitações e direitos dos usuários.',
    'termos-de-uso-v1.0.pdf',
    'v1.0-2025-10-25',
    'terms',
    1,
    '2025-10-25T00:00:00Z'
  ),
  (
    'Política de Privacidade',
    'Explica como a Tutor Flow coleta, utiliza, armazena e protege os dados pessoais dos usuários, em conformidade com a LGPD.',
    'politica-de-privacidade-v1.0.pdf',
    'v1.0-2025-10-25',
    'privacy',
    2,
    '2025-10-25T00:00:00Z'
  ),
  (
    'Acordo de Serviços de Pagamento (PSA)',
    'Define as condições para o processamento de pagamentos, taxas, responsabilidades e fluxo financeiro entre tutores, alunos e a plataforma.',
    'acordo-servicos-pagamento-v1.0.pdf',
    'v1.0-2025-10-25',
    'payment',
    3,
    '2025-10-25T00:00:00Z'
  ),
  (
    'Termos Resumidos do Aluno',
    'Versão simplificada e objetiva dos termos de contratação aplicáveis aos alunos que utilizam a plataforma para contratar serviços de tutoria.',
    'termos-resumidos-aluno-v1.0.pdf',
    'v1.0-2025-10-25',
    'student_terms',
    4,
    '2025-10-25T00:00:00Z'
  ),
  (
    'Política de Uso Aceitável e Propriedade Intelectual',
    'Estabelece as regras para conteúdo gerado pelo usuário (CGU), incluindo direitos autorais, moderação e procedimentos de denúncia.',
    'politica-ugc-v1.0.pdf',
    'v1.0-2025-10-25',
    'ugc',
    5,
    '2025-10-25T00:00:00Z'
  ),
  (
    'Política de Cookies',
    'Explica o uso de cookies e tecnologias de rastreamento na plataforma, tipos de cookies utilizados e como gerenciar preferências.',
    'politica-cookies-v1.0.pdf',
    'v1.0-2025-10-25',
    'cookies',
    6,
    '2025-10-25T00:00:00Z'
  ),
  (
    'Acordo de Nível de Serviço (SLA)',
    'Define as métricas de desempenho, uptime garantido, suporte técnico e compensações aplicáveis aos usuários tutores.',
    'sla-tutores-v1.0.pdf',
    'v1.0-2025-10-25',
    'sla',
    7,
    '2025-10-25T00:00:00Z'
  );