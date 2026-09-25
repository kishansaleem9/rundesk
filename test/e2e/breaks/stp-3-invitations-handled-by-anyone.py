# AN INVITATION IS HANDLED BY ANY SIGNED-IN PERSON: a plain member reads its link and cancels it.
# Reddens: settings-tabs-by-key: "a plain member neither reads an invitation’s link nor cancels it (403 each, still pending) — the member granted members.invite reads it and cancels it"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (await this.mayInvite(workspaceId, user)) return inv\n'
b = '      return inv\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-3-invitations-handled-by-anyone: handling an invitation asks nothing')
