# Speed bars that carry no information: the Fast tier scores the same speed as
# the Max tier, so the two bars come out the same length and the pair of
# numbers the hover card exists to compare says nothing.
#
# REWRITTEN 21 September, AFTER IT RAN GREEN. It used to set Fast's speed to 3
# and its claim line named "the Deep tier's" — but the check compares Fast
# against MAX (`fastSpeed > maxSpeed + 2`), and Max scores 2, so Fast at 3 is
# still visibly longer and the check passed correctly.
#
# The claim line verified anyway, and that is worth writing down:
# `check-break-claims.mjs` matches on a five-word fragment, and
# "Speed bar is visibly longer than the" is common to both sentences. The
# matcher can accept a claim that differs in exactly the word that decides
# which check it is — the tier's name. A fragment long enough not to appear by
# accident is not the same as a fragment that pins the meaning.
#
# Reddens: ai-model-picker:
#   "the Fast tier's Speed bar is visibly longer than the Max tier's"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/model-tiers.ts'
a = '    speed: 5,\n    intelligence: 2,'
b = '    speed: 2,\n    intelligence: 2,'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('model-tiers.ts: the Fast tier scores the same speed as the Max tier.')
