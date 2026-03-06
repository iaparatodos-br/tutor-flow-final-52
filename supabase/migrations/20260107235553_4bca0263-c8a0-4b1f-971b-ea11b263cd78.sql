-- Atualizar constraint para aceitar novos tipos de item (monthly_base, overage)
ALTER TABLE invoice_classes DROP CONSTRAINT IF EXISTS invoice_classes_item_type_check;
ALTER TABLE invoice_classes ADD CONSTRAINT invoice_classes_item_type_check 
  CHECK (item_type = ANY (ARRAY['completed_class', 'cancellation_charge', 'monthly_base', 'overage']));

-- Atualizar constraint de cancellation para incluir novos tipos
ALTER TABLE invoice_classes DROP CONSTRAINT IF EXISTS invoice_classes_cancellation_check;
ALTER TABLE invoice_classes ADD CONSTRAINT invoice_classes_cancellation_check 
  CHECK (
    (item_type = 'cancellation_charge') OR 
    ((item_type IN ('completed_class', 'monthly_base', 'overage')) AND (cancellation_policy_id IS NULL))
  );