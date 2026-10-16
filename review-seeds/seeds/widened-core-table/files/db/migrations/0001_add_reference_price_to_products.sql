ALTER TABLE products ADD COLUMN reference_price integer;
ALTER TABLE products ADD COLUMN reference_price_day date;
ALTER TABLE products ADD COLUMN reference_price_source text;
ALTER TABLE products ADD COLUMN reference_price_currency text NOT NULL DEFAULT 'USD';
