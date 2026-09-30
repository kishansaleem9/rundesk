# THE LINKS ARE LEFT OUT (`found-30-sep/attachments-have-no-download-all`): the zip holds the task's files and
# nothing of its links, so a zip handed on "for easy sharing" loses part of what the section shows, with
# nothing in it to say so.
# Reddens: task-attachments: "and its links are listed in links.txt, each by its name and then its address, in the list's order"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const listed = links.length ? linksText(links) : null\n"
b = "    const listed = links.length < 0 ? linksText(links) : null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: Download all leaves the task\'s links out.')
