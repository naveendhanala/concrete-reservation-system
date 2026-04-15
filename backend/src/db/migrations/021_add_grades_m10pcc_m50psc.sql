-- Add M10 PCC and M50 PSC to concrete_grade ENUM
ALTER TYPE concrete_grade ADD VALUE IF NOT EXISTS 'M10_PCC';
ALTER TYPE concrete_grade ADD VALUE IF NOT EXISTS 'M50_PSC';
