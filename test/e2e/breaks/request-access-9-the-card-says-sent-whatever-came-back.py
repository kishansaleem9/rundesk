# THE CARD SAYS "SENT" WHATEVER CAME BACK (`found-30-sep/access-asks-from-outside-the-workspace`).
#
# An ask the server refuses (an hour's worth already made, or nothing there to
# ask about) passes nothing on, and the card says so in the server's words.
# Let it say "sent" whatever came back, as it did, and a refused ask reads as
# one passed on.
#
# Reddens: request-access: "and the card says such an ask was refused, in the server’s words, not that it was sent"
import io
p = '/home/user/rundesk/apps/web/src/components/request-access-card.tsx'
a = "    onSuccess: () => setAsked(true),\n    onError: (err) => setRefused(err instanceof ApiError ? err.message : t('requestAccess.failed')),\n"
b = "    onSettled: () => setAsked(true),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-9-the-card-says-sent-whatever-came-back: the card says sent whatever came back')
