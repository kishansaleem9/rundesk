# The status duration is sent as `minutes` instead of being turned into a
# moment, so the server stores no expiry at all.
#
# The dialog is unchanged: the four presets are there, the one you press lights
# up, the emoji and the text save, and the status appears in presence for
# everybody. The request still carries the duration — the field is called
# `minutes` and holds 30 — so a reader of the mutation would say the duration
# is being sent. The server takes `expiresAt` and ignores an unknown field, so
# `statusExpiresAt` stays null and the status is permanent.
#
# `[06:42]` is specific about this: thirty minutes is her example, and it is
# "the part four presences cannot do". A custom status with no end is a
# presence, which is the thing it was meant to be better than — and the failure
# is invisible for thirty minutes, then invisible forever, because nothing ever
# changes back.
#
# The plausible route is the mutation's own comment being read as a note rather
# than a reason: "The duration is turned into a moment here rather than sent as
# minutes, because the server takes an instant." Sending the field named the
# same thing as the parameter looks like removing a translation step.
#
# One check: the status text, the emoji, and the teammate reading presence are
# all unaffected. Only the one that asks when it stops being true can see it.
#
# Reddens: settings-depth: "and it stops being true in about thirty minutes"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """          // The duration is turned into a moment here rather than sent as
          // minutes, because the server takes an instant — and computing it
          // from the picked preset keeps "30 minutes" meaning thirty minutes
          // from when they pressed it.
          expiresAt: input.minutes ? new Date(Date.now() + input.minutes * 60_000).toISOString() : null,
"""
b = """          minutes: input.minutes,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: the status duration is sent as minutes and stored as nothing.')
