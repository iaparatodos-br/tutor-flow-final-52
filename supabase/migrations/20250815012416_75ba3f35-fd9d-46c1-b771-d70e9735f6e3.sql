-- Fix storage policies for expense receipts
-- First, let's check if we need to recreate policies

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Professores podem visualizar seus comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Professores podem fazer upload de seus comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Professores podem atualizar seus comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Professores podem deletar seus comprovantes" ON storage.objects;

-- Create more permissive policies for testing
CREATE POLICY "Teachers can view their expense receipts" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'expense-receipts' AND 
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Teachers can upload their expense receipts" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'expense-receipts' AND 
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Teachers can update their expense receipts" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'expense-receipts' AND 
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Teachers can delete their expense receipts" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'expense-receipts' AND 
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);