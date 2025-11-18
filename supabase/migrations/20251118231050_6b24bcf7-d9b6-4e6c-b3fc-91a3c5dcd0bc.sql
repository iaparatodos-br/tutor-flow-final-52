-- Add notification preferences to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"material_shared": true, "class_reminder": true, "class_confirmed": true, "class_cancelled": true, "invoice_created": true}'::jsonb;

-- Add comment
COMMENT ON COLUMN profiles.notification_preferences IS 'User preferences for email notifications';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_notification_preferences ON profiles USING GIN (notification_preferences);