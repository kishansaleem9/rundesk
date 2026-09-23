# THE ADMIN PAGE'S MAP AS IT WAS: `member.joined` with no name, shown as its id.
# Reddens: webhook-access: "this page offers the same events, each by its name"
import io
p = '/home/user/rundesk/apps/web/src/lib/webhook-events.ts'
a = "  'member.joined': 'adminWebhooks.event.memberJoined',\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-17-member-joined-unlabelled: applied")
