-- Create subscription plans table
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL,
  billing_interval TEXT NOT NULL DEFAULT 'month',
  stripe_price_id TEXT UNIQUE,
  student_limit INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user subscriptions table
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  extra_students INTEGER NOT NULL DEFAULT 0,
  extra_cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add subscription fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN current_plan_id UUID REFERENCES public.subscription_plans(id),
ADD COLUMN subscription_status TEXT DEFAULT 'free',
ADD COLUMN subscription_end_date TIMESTAMPTZ;

-- Enable RLS on new tables
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscription_plans (public read access)
CREATE POLICY "Anyone can view active subscription plans" 
ON public.subscription_plans 
FOR SELECT 
USING (is_active = true);

-- RLS policies for user_subscriptions
CREATE POLICY "Users can view their own subscriptions" 
ON public.user_subscriptions 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own subscriptions" 
ON public.user_subscriptions 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "System can insert subscriptions" 
ON public.user_subscriptions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update all subscriptions" 
ON public.user_subscriptions 
FOR UPDATE 
USING (true);

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, slug, price_cents, student_limit, features) VALUES
('Gratuito', 'free', 0, 3, '{"financial_module": false, "group_classes": false, "expenses": false, "storage_mb": 500}'),
('Básico', 'basic', 1900, 15, '{"financial_module": true, "group_classes": false, "expenses": false, "storage_mb": 2048}'),
('Profissional', 'professional', 2900, 40, '{"financial_module": true, "group_classes": true, "expenses": true, "storage_mb": 5120}'),
('Premium', 'premium', 3900, 80, '{"financial_module": true, "group_classes": true, "expenses": true, "storage_mb": 5120}');

-- Create trigger for updated_at columns
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();