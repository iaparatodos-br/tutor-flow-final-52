-- Delete duplicate invoices created by the faulty automated billing
DELETE FROM invoices 
WHERE teacher_id = '11124892-ee21-4e8b-9a2e-ef041f191eee' 
  AND student_id = 'c4d42bd4-b32e-4687-b7ae-3324cbabf39e' 
  AND created_at > NOW() - INTERVAL '2 hours'
  AND amount = 10.00;