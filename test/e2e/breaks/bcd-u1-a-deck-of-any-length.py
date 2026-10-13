# A DECK OF ANY LENGTH: the fifteen-slide limit is not read, so a model's thirty slides are kept.
# Reddens: unit: apps/api/src/modules/ai/artifacts-parse.test.ts "refuses a deck past fifteen slides, and says so"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/artifacts.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (o.slides.length > DECK_LIMITS.slides) return { ok: false, reason: `A slide deck has at most ${DECK_LIMITS.slides} slides` }\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-u1-a-deck-of-any-length: a deck past fifteen slides is kept')
