import { createFileRoute } from '@tanstack/react-router'

/*
 * `resume-defects/resume-7` — A CLIP'S LINK. Copy link and New tab on a clip
 * hand out `/clips/<token>`, which the page signs again on every view, where
 * they handed out a signed storage URL that died in a day. Outside `/app`,
 * because ClickUp's clip links open without signing in; the page asks for a
 * sign-in only where the clip's workspace blocks public sharing.
 *
 * `resume-defects/s4-clip-link` (a pasted clip link rendering as the clip)
 * recognises this route and reads the same `GET /public/clips/:token`.
 */
export const Route = createFileRoute('/clips/$token')({})
