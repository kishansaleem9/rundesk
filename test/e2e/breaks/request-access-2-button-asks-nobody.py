# The button shows the confirmation and sends no request.
#
# `onClick={() => request.mutate()}` becomes `onClick={() => setAsked(true)}`,
# which is what `onSettled` does anyway — so the screen behaves identically and
# nobody is ever told. The dead end this item removes is put back with a
# receipt on top: the person believes they have asked, and waits.
#
# THIS EXACT PATCH HAS ALREADY PASSED ONCE. The suite's comment records it:
# "The first version of this check asked only whether the owner's inbox held
# any `access_requested` row, and it passed against a deliberately inert
# button — because a previous run had left one there. An accumulating inbox
# makes 'some row of this kind exists' true forever after the first success,
# which is a check that stops checking." It matches on the task id now, which
# is minted fresh every run.
#
# So this patch is the one that proves the repair, and it reddens exactly the
# check that was repaired. The card, the button and the confirmation all still
# render — which is the whole difficulty: every visible thing is correct.
#
# Reddens: request-access: "and whoever can grant it hears about THIS object"
import io
p = '/home/user/rundesk/apps/web/src/components/request-access-card.tsx'
a = "          onClick={() => request.mutate()}"
b = "          onClick={() => setAsked(true)}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-card.tsx: the ask button now only shows the confirmation.')
