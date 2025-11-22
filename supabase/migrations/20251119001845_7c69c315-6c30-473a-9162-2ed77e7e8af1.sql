-- Atualizar preferências padrão de notificação para incluir todos os tipos
ALTER TABLE public.profiles 
ALTER COLUMN notification_preferences 
SET DEFAULT '{
  "material_shared": true,
  "class_reminder": true,
  "class_confirmed": true,
  "class_cancelled": true,
  "class_report_created": true,
  "invoice_created": true,
  "invoice_payment_reminder": true,
  "invoice_paid": true,
  "invoice_overdue": true
}'::jsonb;

COMMENT ON COLUMN public.profiles.notification_preferences IS 'User email notification preferences including: material_shared, class_reminder, class_confirmed, class_cancelled, class_report_created, invoice_created, invoice_payment_reminder, invoice_paid, invoice_overdue';

-- Atualizar registros existentes que não têm as novas preferências
UPDATE public.profiles
SET notification_preferences = notification_preferences || '{
  "class_report_created": true,
  "invoice_payment_reminder": true,
  "invoice_paid": true,
  "invoice_overdue": true
}'::jsonb
WHERE notification_preferences IS NOT NULL
  AND (
    notification_preferences->>'class_report_created' IS NULL
    OR notification_preferences->>'invoice_payment_reminder' IS NULL
    OR notification_preferences->>'invoice_paid' IS NULL
    OR notification_preferences->>'invoice_overdue' IS NULL
  );