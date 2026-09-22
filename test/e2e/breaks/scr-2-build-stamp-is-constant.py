# `version.json` is still emitted, and every build stamps the same id.
#
# THE FACADE. The file exists, the plugin runs, the fetch succeeds, the JSON
# parses, and the field is called `buildId` — everything a running tab does to
# find out whether it is stale works perfectly and always answers "you are
# current". A tab open across a deploy is never told there is a newer build,
# and the only symptom is that a feature somebody shipped does not appear until
# the person happens to reload for their own reasons.
#
# The plausible route to it is a reproducible-build change: `BUILD_ID` varying
# per build makes `version.json` the one asset whose content differs between
# two otherwise identical builds, and pinning it is exactly what somebody
# chasing deterministic output would do.
#
# PREDICTED ONE AND IT IS THREE, and the two extra are the point of the facade
# rather than a miscount. "the build stamps a version.json" still PASSES —
# correctly; it is right there — and only the check that compares two RELEASES
# can see the constant, which is why the suite builds twice. A single-build
# check of a versioning mechanism cannot tell a version from a constant.
#
# The other two are downstream, in the section about a tab that is merely old.
# With both releases stamping `rundesk` the tab compares its own id against the
# server's, finds them equal, and behaves exactly as a current tab should: the
# reload lands on "the new one" that is byte-identical to the old one, and it
# never stops saying anything because it never started. The chain is
# `a stale tab is told there is a newer build` → it reloads → the notice
# clears, and a constant id severs it at the first link while every individual
# mechanism keeps working.
#
# Reddens: stale-chunk-recovery: "and two releases stamp different ids" and
#   "and reloading lands on the new one" and
#   "and stops saying so once it is current"
import io
p = '/home/user/rundesk/apps/web/vite.config.ts'
a = """          fileName: 'version.json',
          source: JSON.stringify({ buildId: BUILD_ID }),
"""
b = """          fileName: 'version.json',
          // Reproducible output: the same source should build to the same bytes.
          source: JSON.stringify({ buildId: 'rundesk' }),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vite.config.ts: every build stamps the same buildId.')
