# The person's local time is rendered as their zone NAME instead of a clock.
#
# `Asia/Karachi` is more precise than `5:42 PM`, it never goes stale, and it
# needs no `Intl` call, no `now`, and no re-render on the minute — so a
# component that formats a time on every tick looks like work being done for
# nothing. The `try/catch` around the formatter goes with it, which reads as
# removing a guard that has nothing left to guard.
#
# `[05:46]` is "mera TIME ZONE kya chal raha hai" — what time is it where they
# are. The answer to that is a clock. A zone name is the input to the
# calculation, and it asks the reader to do the arithmetic: nobody looking at a
# colleague's profile before sending a message wants to work out what
# `America/Argentina/Buenos_Aires` means in their own hours.
#
# One check, and it is written as a test of the FORM rather than of the value:
# `/\\d/.test(clock)` with the sentence "and their LOCAL TIME as a clock, not a
# zone name". A check that asserted the element was merely visible would pass
# on this, which is why the suite reads the text and looks for a digit.
#
# Reddens: person-panel: "and their LOCAL TIME as a clock, not a zone name"
import io
p = '/home/user/rundesk/apps/web/src/components/person-panel.tsx'
a = """  let time: string
  try {
    time = new Intl.DateTimeFormat([], { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(now)
  } catch {
    // An unrecognised zone is somebody's stored typo, not a reason to blank
    // the whole header.
    return null
  }
"""
b = """  // The zone itself is precise and never goes stale.
  const time = timezone
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('person-panel.tsx: the local time is the zone name, not a clock.')
