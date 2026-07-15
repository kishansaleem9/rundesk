-- More custom-field types (email/phone/money/rating). Additive enum values;
-- ADD VALUE IF NOT EXISTS is idempotent and safe (values are not used in this tx).
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'phone';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'money';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'rating';
