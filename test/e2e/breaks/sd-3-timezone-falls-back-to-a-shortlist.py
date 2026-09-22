# The timezone picker drops `Intl.supportedValuesOf` and offers the ten-zone
# fallback list to everybody.
#
# THE SHORTLIST THAT LOOKS LIKE A LIST. The picker is still a `<select>`, still
# has the testid, still saves, still shows the drift notice, and still offers
# the stored value separately so nobody's own zone disappears. It has ten
# entries instead of four hundred and something, and ten is enough to look like
# a working dropdown in a screenshot.
#
# The plausible route is a compatibility worry read one step too far: the
# comment above this list already says `supportedValuesOf` is ES2022 and absent
# on older engines, and somebody deciding to use one code path everywhere
# rather than two is making a consistency argument, not a careless one.
#
# What it costs is anybody outside those ten places. Karachi is on the list and
# Lahore is not; a person in Lagos, Sao Paulo or Auckland cannot set their own
# timezone at all — and the app then reports their working hours, their
# planner and their meeting times in somebody else's day.
#
# One check, and the suite says why it is written as a floor of a hundred rather
# than "the list is not empty": "A handful would mean a fallback list rendered
# because the real one failed." That is exactly what this makes happen, on
# purpose, in a browser where the real one works.
#
# Reddens: settings-depth: "holding the world, not a shortlist"
import io
p = '/home/user/rundesk/apps/web/src/pages/app-profile-page.tsx'
a = """  try {
    const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (typeof supported === 'function') return supported('timeZone')
  } catch {
    /* fall through */
  }
  return ['UTC',"""
b = """  // One code path on every engine, rather than two that can disagree.
  return ['UTC',"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-profile-page.tsx: the timezone picker offers ten zones to everybody.')
