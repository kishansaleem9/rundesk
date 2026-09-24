# A MEETING'S ACTION ITEMS GO WHEREVER THE BODY SAYS, as they did: no list is checked.
# Reddens: meeting-access: "the member cannot turn a meeting’s action items into tasks in the private list — not found, before any model is asked, and nothing made — while the open list is let through"
import io
p = '/home/user/rundesk/apps/api/src/modules/meetings/meetings.service.ts'
a = '    if (opts.createIn) await this.assertCanMakeTasksIn(workspaceId, opts.createIn, userId)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mtg-1-any-destination: applied")
