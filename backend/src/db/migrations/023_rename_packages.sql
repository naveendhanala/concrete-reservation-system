-- Rename packages to short codes, removing the "Package N - " prefix
UPDATE packages SET package_name = 'E6'      WHERE package_name = 'Package 1 - E6';
UPDATE packages SET package_name = 'E8'      WHERE package_name = 'Package 2 - E8';
UPDATE packages SET package_name = 'E9'      WHERE package_name = 'Package 3 - E9';
UPDATE packages SET package_name = 'E13'     WHERE package_name = 'Package 4 - E13';
UPDATE packages SET package_name = 'N7'      WHERE package_name = 'Package 5 - N7';
UPDATE packages SET package_name = 'N10'     WHERE package_name = 'Package 6 - N10';
UPDATE packages SET package_name = 'N11'     WHERE package_name = 'Package 7 - N11';
UPDATE packages SET package_name = 'N13'     WHERE package_name = 'Package 8 - N13';
UPDATE packages SET package_name = 'N14'     WHERE package_name = 'Package 9 - N14';
UPDATE packages SET package_name = 'Zone 3A' WHERE package_name = 'Package 10 - Zone 3A';
UPDATE packages SET package_name = 'Zone 4'  WHERE package_name = 'Package 11 - Zone 4';
UPDATE packages SET package_name = 'Zone 5B' WHERE package_name = 'Package 12 - Zone 5B';
UPDATE packages SET package_name = 'Zone 10' WHERE package_name = 'Package 13 - Zone 10';
