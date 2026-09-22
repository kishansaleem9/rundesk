# Uploads are attempted before the task exists, against an id that is not a task.
# Reddens: attach-on-create: "the task is created first and the uploads hang off its
#   id"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      const task = templateId\n'
b = "      for (const early of attachments) {\n        try {\n          await api(`/tasks/${listId}/attachments/presign`, {\n            method: 'POST',\n            body: { fileName: early.name, contentType: 'text/plain', sizeBytes: early.size },\n          })\n        } catch { /* the point of the patch */ }\n      }\n      const task = templateId\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Uploads are attempted before the task exists, against an id that is not a task.')
