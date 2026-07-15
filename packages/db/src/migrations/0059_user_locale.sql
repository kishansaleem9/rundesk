-- UI language preference (Plan §13 i18n). BCP-47 short code; drives web
-- localization + text direction (RTL for ar/he/fa). Additive; defaults to 'en'.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" text NOT NULL DEFAULT 'en';
