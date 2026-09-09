-- §V2-01c — the field types that are genuinely storage plus a renderer.
--
-- Frames `00:20`/`00:40` show a searchable picker of ~29 types. Rundesk had
-- ten. These six are the ones that need nothing but somewhere to put a value
-- and something to draw it with:
--
--   long_text       a textarea; she calls it "Text area (Long Text)"
--   labels          several of a defined set, unlike dropdown's one
--   people          several workspace members
--   location        a place, as written
--   tshirt_size     XS · S · M · L · XL, a fixed set rather than a per-field one
--   progress_manual the percentage you set yourself, beside 0142's derived one
--
-- WHAT IS DELIBERATELY NOT HERE, and it is not an oversight:
--
--   · **Files** is a reference into the attachments module, not a value. It
--     needs upload plumbing, and a half-built one would be a field you can
--     define and never fill.
--   · **Voting** needs to know WHO voted. `setValue` takes no actor, by design
--     — every other type's value is the same for everybody. Per-user state is
--     a feature, not a field type.
--   · **Formula**, and the AI four (Summary, Translation, Sentiment, Action
--     Items) are features wearing a type's clothing.
--
-- Additive enum values, following 0058 and 0142. ADD VALUE IF NOT EXISTS is
-- idempotent and none of the values is used in this transaction.
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'long_text';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'labels';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'people';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'location';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'tshirt_size';
ALTER TYPE "custom_field_type" ADD VALUE IF NOT EXISTS 'progress_manual';
