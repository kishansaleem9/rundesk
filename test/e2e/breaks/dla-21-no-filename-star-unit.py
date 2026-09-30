# THE ZIP'S NAME IS SENT IN ASCII ALONE (`found-30-sep/attachments-have-no-download-all`): there is no
# `filename*`, so a task titled in Arabic or Urdu is saved as "task-attachments.zip".
# Reddens: unit: tasks-attachments-zip.test.ts "names it <title>-attachments.zip, made safe, with the whole name in filename*"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/attachments-zip.ts'
a = "    disposition: `attachment; filename=\"${asciiBase}-attachments.zip\"; filename*=UTF-8''${encodeExtValue(fileName)}`,\n"
b = "    disposition: `attachment; filename=\"${asciiBase}-attachments.zip\"`,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-21-no-filename-star-unit: the disposition carries no filename*')
