
ALTER TABLE classes
  ADD CONSTRAINT classes_duration_minutes_check
  CHECK (duration_minutes >= 15 AND duration_minutes <= 480);

ALTER TABLE class_services
  ADD CONSTRAINT class_services_duration_minutes_check
  CHECK (duration_minutes >= 15 AND duration_minutes <= 480);
