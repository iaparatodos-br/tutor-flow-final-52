-- Create expense categories table
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create policies for expense_categories
CREATE POLICY "Professores podem gerenciar suas categorias de despesa" 
ON public.expense_categories 
FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Create policies for expenses
CREATE POLICY "Professores podem gerenciar suas despesas" 
ON public.expenses 
FOR ALL 
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Create triggers for updated_at
CREATE TRIGGER update_expense_categories_updated_at
BEFORE UPDATE ON public.expense_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for expense receipts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('expense-receipts', 'expense-receipts', false);

-- Create storage policies for expense receipts
CREATE POLICY "Professores podem visualizar seus comprovantes" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'expense-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Professores podem fazer upload de seus comprovantes" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'expense-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Professores podem atualizar seus comprovantes" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'expense-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Professores podem deletar seus comprovantes" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'expense-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Insert default expense categories
INSERT INTO public.expense_categories (teacher_id, name, color, is_default) VALUES
  ('00000000-0000-0000-0000-000000000000', 'Material didático', '#3B82F6', true),
  ('00000000-0000-0000-0000-000000000000', 'Transporte', '#10B981', true),
  ('00000000-0000-0000-0000-000000000000', 'Alimentação', '#F59E0B', true),
  ('00000000-0000-0000-0000-000000000000', 'Equipamentos', '#8B5CF6', true),
  ('00000000-0000-0000-0000-000000000000', 'Cursos e treinamentos', '#EF4444', true),
  ('00000000-0000-0000-0000-000000000000', 'Marketing', '#EC4899', true),
  ('00000000-0000-0000-0000-000000000000', 'Despesas administrativas', '#6B7280', true),
  ('00000000-0000-0000-0000-000000000000', 'Outros', '#64748B', true);

-- Create indexes for better performance
CREATE INDEX idx_expenses_teacher_id ON public.expenses(teacher_id);
CREATE INDEX idx_expenses_expense_date ON public.expenses(expense_date);
CREATE INDEX idx_expenses_category ON public.expenses(category);
CREATE INDEX idx_expense_categories_teacher_id ON public.expense_categories(teacher_id);