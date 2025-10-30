-- Remover índices órfãos que referenciam colunas billed removidas
DROP INDEX IF EXISTS public.idx_classes_billing;
DROP INDEX IF EXISTS public.idx_class_participants_billed;

COMMENT ON TABLE public.invoice_classes IS 
'Rastreamento de faturamento - substituiu campos billed de classes e class_participants';