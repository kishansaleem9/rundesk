-- Uploaded avatars and workspace logos were SAVED as the URL `getObjectUrl`
-- returned at upload time — on a deployment with no public R2/CDN domain, a
-- presigned GET that expires after 900 seconds. Every one of them has since
-- expired: a broken image wherever that person or workspace is drawn.
--
-- Uploads now save `/api/v1/public/images/<key>`, which signs a fresh URL per
-- request (`public-images.controller.ts`). This rewrites the saved ones to it.
--
-- ONLY presigned URLs — `X-Amz-Signature` in the query — are touched, and only
-- when the path ends in a key of the two public prefixes in the uploads'
-- alphabet. A public-CDN URL (stable already), an OAuth provider's avatar, and
-- anything else is left exactly as it is.
UPDATE "users"
   SET "avatar_url" = '/api/v1/public/images/' || substring("avatar_url" from '(avatars/[A-Za-z0-9._-]+)\?')
 WHERE "avatar_url" ~ '/avatars/[A-Za-z0-9._-]+\?.*X-Amz-Signature=';

UPDATE "workspaces"
   SET "logo_url" = '/api/v1/public/images/' || substring("logo_url" from '(workspace-logos/[A-Za-z0-9._-]+)\?')
 WHERE "logo_url" ~ '/workspace-logos/[A-Za-z0-9._-]+\?.*X-Amz-Signature=';
