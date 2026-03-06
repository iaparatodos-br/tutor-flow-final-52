
-- LIMPEZA PARA TESTE: Deletar invoice_classes das aulas do Senhor Erik 
-- para permitir reprocessamento pelo sistema de mensalidade

-- Deletar os 4 invoice_classes vinculados à fatura 78311db4...
DELETE FROM invoice_classes 
WHERE invoice_id = '78311db4-3653-47bc-9c05-a11a4c6d3526';
