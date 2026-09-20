# A space id that addresses nothing is reported as a server-side wiring problem
# rather than as "that space is not here" — the person is told to call support
# about a typo.
# Reddens: ai-create-containers: "a space id that does not exist is refused as `unknown_space`"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (!space) return refuse(kind, 'unknown_space')\n"
b = "    if (!space) return refuse(kind, 'unavailable')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: an unknown space now refuses with the wrong reason.')
