ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb NOT NULL DEFAULT '{
  "channels": {
    "webEnabled": true,
    "mobileEnabled": false,
    "dndOn": false,
    "dndStart": "21:00",
    "dndEnd": "08:00",
    "muteSounds": false
  },
  "events": {
    "mention": { "inApp": true, "web": true, "mobile": false, "email": true },
    "assigned": { "inApp": true, "web": true, "mobile": false, "email": true },
    "comment": { "inApp": true, "web": true, "mobile": false, "email": true },
    "due": { "inApp": true, "web": true, "mobile": false, "email": true },
    "status": { "inApp": true, "web": true, "mobile": false, "email": true },
    "doc": { "inApp": true, "web": true, "mobile": false, "email": true },
    "chat": { "inApp": true, "web": true, "mobile": false, "email": true },
    "activity": { "inApp": true, "web": true, "mobile": false, "email": true }
  }
}'::jsonb;
