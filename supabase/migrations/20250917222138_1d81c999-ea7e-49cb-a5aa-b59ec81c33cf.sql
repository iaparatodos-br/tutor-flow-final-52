-- Add policy_document_url column to profiles table
ALTER TABLE public.profiles
ADD COLUMN policy_document_url TEXT;

-- Create storage bucket for policies
INSERT INTO storage.buckets (id, name, public) VALUES ('policies', 'policies', false);

-- Allow authenticated users to read policy documents
CREATE POLICY "Allow authenticated users to read policy documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'policies' AND (
    -- The profile owner (teacher) can read their own file
    auth.uid()::text = (storage.foldername(name))[1] OR
    -- A student can read their teacher's policy
    EXISTS (
      SELECT 1
      FROM teacher_student_relationships tsr
      WHERE tsr.student_id = auth.uid() 
      AND tsr.teacher_id::text = (storage.foldername(name))[1]
    )
  )
);

-- Allow profile owner to upload/update their policy document
CREATE POLICY "Allow profile owner to upload/update their policy document"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'policies' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow profile owner to update their policy document
CREATE POLICY "Allow profile owner to update their policy document"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'policies' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow profile owner to delete their policy document
CREATE POLICY "Allow profile owner to delete their policy document"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'policies' AND
  auth.uid()::text = (storage.foldername(name))[1]
);