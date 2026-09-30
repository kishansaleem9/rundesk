# THE CARD IS OFFERED WITHOUT A WORKSPACE OR AN ID TO ASK ABOUT, so its button posts to `/shares/task/undefined`.
# Reddens: unit: request-access-offer.test.ts "does not offer it without the workspace and the id to ask about"
import io
p = '/home/user/rundesk/apps/web/src/components/request-access-offer.ts'
a = '  if (!workspaceId || !objectId) return false\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rao-2-the-card-asks-about-nothing-unit: the card is offered without its ids')
