# Rundesk Chat handoff

This project is a Next.js + React + Prisma/MySQL Rundesk Chat implementation. The chat interaction model is inspired by mature team-chat products, while the visual system stays Rundesk-specific.

## This pass adds

- Resizable global Rundesk navigation and Chat sidebar with persisted widths.
- Collapse/expand behavior for both navigation areas.
- Compact top app bar and channel header with Channel/View row.
- Functional right utility rail for channel search, replies, assigned messages, members, and settings.
- Database-backed channel member/follower panel.
- Database-backed Inbox/Replies/Assigned Messages panels.
- Resolve/reopen assigned follow-up messages.
- Channel-scoped message search.
- Functional message `Mark unread` behavior.
- Working browser microphone recording with permission handling and MediaRecorder.
- Voice recordings upload as message attachments and render with an audio player.
- Direct-message display names derived from conversation members instead of internal channel IDs.
- More compact message density and ClickUp-like hover interaction placement using Rundesk styling.

## Local setup

1. Copy `.env.example` to `.env` and provide development MySQL credentials.
2. Install dependencies:
   `npm install`
3. Generate Prisma client:
   `npm run db:generate`
4. Apply migrations:
   `npm run db:migrate`
5. Seed if needed:
   `npm run db:seed`
6. Start:
   `npm run dev`

## Validation in this handoff

- ESLint: passed.
- TypeScript `tsc --noEmit`: passed.
- Next production build could not be executed in the Linux handoff environment because the uploaded Windows `node_modules` required Next.js to download a Linux SWC binary and network access is disabled. Run `npm run build` on the target Windows machine after `npm install`.

## External infrastructure intentionally not faked

- Live audio/video calls
- Realtime multi-user presence/delivery provider
- AI provider responses
- Cloud storage integrations (Drive/Dropbox/OneDrive/Box)
- Production auth and production object storage

## Latest parity pass

- ClickUp screenshots are treated only as interaction/layout references; screenshot names, messages and task content are not seeded into Rundesk.
- Global and Chat sidebars default to a more compact width and remain draggable/collapsible with localStorage persistence.
- Channel header now has persisted favorite state, functional mute/unmute, a complete actions menu, share link, edit, members and delete actions.
- Right-rail avatars come from actual selected-channel membership rather than every workspace user.
- Members panel supports adding/removing members (permission checked server-side) and a Sharing & Permissions view.
- Channel search/global search can navigate across channels to an exact message and briefly highlight it.
- Replies panel now has Unread/Read tabs with a local read marker; Inbox/Assigned/Replies items navigate to the source message.
- Channel settings panel has Rundesk-styled topic, description, follower/member, privacy and access sections.
- Thread follow state is loaded from the backend instead of always starting false.
- Voice recording remains browser-native (`getUserMedia` + `MediaRecorder`) and attaches recordings through the existing upload flow.
