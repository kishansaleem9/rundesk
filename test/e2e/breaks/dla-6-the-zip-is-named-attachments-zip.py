# THE ZIP IS NAMED "attachments.zip", WHATEVER THE TASK (`found-30-sep/attachments-have-no-download-all`):
# ClickUp's is always "clickup-attachments", and its feedback board asks for the task's name, because several
# downloads arrive as "(1)", "(2)" and have to be renamed by hand.
# Re-anchored 30 September (`found-30-sep/list-export-saved-as-list-csv`): the zip's name is made by the rule
# every download shares, `downloadName`, so the break names the file where `attachmentsZipName` asks for it.
# Reddens: task-attachments: "and the zip is saved under the task's name — <title>-attachments.zip, with the characters no file name may hold made safe"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/attachments-zip.ts'
a = "  return downloadName(title, '-attachments.zip', 'task')\n"
b = "  void title\n  return { fileName: 'attachments.zip', disposition: 'attachment; filename=\"attachments.zip\"' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('attachments-zip.ts: every task\'s zip is sent as attachments.zip.')
