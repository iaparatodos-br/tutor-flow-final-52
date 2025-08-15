-- Create cancellation policies table
CREATE TABLE public.cancellation_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  hours_before_class INTEGER NOT NULL DEFAULT 24,
  charge_percentage DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  allow_amnesty BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cancellation_policies
ALTER TABLE public.cancellation_policies ENABLE ROW LEVEL SECURITY;

-- Create policies for cancellation_policies
CREATE POLICY "Professores podem gerenciar suas políticas" 
ON public.cancellation_policies 
FOR ALL 
USING (auth.uid() = teacher_id);

-- Add new columns to classes table
ALTER TABLE public.classes 
ADD COLUMN cancellation_reason TEXT,
ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN cancelled_by UUID,
ADD COLUMN charge_applied BOOLEAN DEFAULT false,
ADD COLUMN amnesty_granted BOOLEAN DEFAULT false,
ADD COLUMN amnesty_granted_by UUID,
ADD COLUMN amnesty_granted_at TIMESTAMP WITH TIME ZONE;

-- Add new columns to invoices table  
ALTER TABLE public.invoices
ADD COLUMN class_id UUID,
ADD COLUMN invoice_type TEXT DEFAULT 'regular',
ADD COLUMN original_amount NUMERIC,
ADD COLUMN cancellation_policy_id UUID;

-- Create trigger for updated_at on cancellation_policies
CREATE TRIGGER update_cancellation_policies_updated_at
BEFORE UPDATE ON public.cancellation_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_cancellation_policies_teacher_id ON public.cancellation_policies(teacher_id);
CREATE INDEX idx_classes_cancelled_at ON public.classes(cancelled_at);
CREATE INDEX idx_invoices_class_id ON public.invoices(class_id);
CREATE INDEX idx_invoices_invoice_type ON public.invoices(invoice_type);