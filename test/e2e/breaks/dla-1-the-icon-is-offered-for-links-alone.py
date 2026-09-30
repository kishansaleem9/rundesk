# THE DOWNLOAD-ALL ICON IS OFFERED FOR LINKS ALONE (`found-30-sep/attachments-have-no-download-all`): the
# header draws it whenever an attachment has a url, so a task whose attachments are links alone offers a
# zip of nothing, which the route answers 404.
# Reddens: task-attachments: "the Attachments header carries a download icon when the task has files, and none when its attachments are links alone"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const hasFiles = attachments.some((a) => a.kind === 'file' && !!a.url)\n"
b = "  const hasFiles = attachments.some((a) => !!a.url)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: Download all is offered on a task of links alone.')
