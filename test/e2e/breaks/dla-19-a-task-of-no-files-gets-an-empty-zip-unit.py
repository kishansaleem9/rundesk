# A TASK OF NO FILES GETS A ZIP OF NOTHING (`found-30-sep/attachments-have-no-download-all`): Download all
# answers a task with no files, or only links, with an archive holding nothing but links.txt, or nothing at all.
# Reddens: unit: tasks-attachments-zip.test.ts "answers 404 for a task with no files, rather than an empty zip"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (present.length === 0) throw new NotFoundException('This task has no files to download')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-19-a-task-of-no-files-gets-an-empty-zip-unit: no files is not refused')
