# THE ZIP IS NAMED "attachments.zip", WHATEVER THE TASK (`found-30-sep/attachments-have-no-download-all`):
# ClickUp's is always "clickup-attachments", and its feedback board asks for the task's name, because several
# downloads arrive as "(1)", "(2)" and have to be renamed by hand.
# Reddens: task-attachments: "and the zip is saved under the task's name — <title>-attachments.zip, with the characters no file name may hold made safe"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/attachments-zip.ts'
a = "    disposition: `attachment; filename=\"${asciiBase}-attachments.zip\"; filename*=UTF-8''${encodeExtValue(fileName)}`,\n"
b = "    disposition: 'attachment; filename=\"attachments.zip\"',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('attachments-zip.ts: every task\'s zip is sent as attachments.zip.')
