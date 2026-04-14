-- Add LabourMob role for Labour Mobilization users
-- They can only manage (add/inactivate) contractors
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'LabourMob';
