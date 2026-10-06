# A CURSOR CARRIES THE NAME ITS BODY GIVES again, not its account's.
# Reddens: realtime-sends-access: "a cursor on a whiteboard comes only from a socket on that board, under its account’s name — not from a member who has not opened it, a member removed from the workspace or an account never in it, and not under a name the sender chose"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      displayName: await this.nameOf(client),\n'
b = '      displayName: (body as { displayName?: string }).displayName ?? (await this.nameOf(client)),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: a cursor is named by its body.')
