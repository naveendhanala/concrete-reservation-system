INSERT INTO packages (package_name, active_flag)
VALUES ('E13', TRUE)
ON CONFLICT (package_name) DO NOTHING;
