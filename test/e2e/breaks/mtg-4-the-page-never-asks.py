# THE PAGE NEVER SENDS THE CHOSEN TAG: the list does not narrow at all.
# Reddens: meeting-tags: "choosing the Standup chip shows the meetings tagged “standup” as well as “Standup”, and not the others"
#   or "the page offers a chip for a tag only a meeting beyond the newest 200 carries, and choosing it shows that meeting"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
a = '  const meetingsQuery = useMeetings(workspaceId, tag)\n'
b = '  const meetingsQuery = useMeetings(workspaceId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mtg-4-the-page-never-asks: the page never asks for the tag')
