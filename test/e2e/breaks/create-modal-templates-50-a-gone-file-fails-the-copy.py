# A FILE WHOSE OBJECT IS GONE FAILS THE DUPLICATE, a 500 after the copy was made, half made.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and a stored file whose object is gone is left out of the copy and named in a warning, the copy made all the same"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ('        try {\n'
     '          await this.r2.copyObject(row.storageKey, storageKey, {\n'
     '            contentType: row.contentType,\n'
     '            metadata: { uploadedby: actorId, taskid: toTaskId },\n'
     '          })\n'
     '        } catch (e) {\n'
     '          console.error(`[tasks.copyAttachmentsTo] ${row.storageKey} was not copied:`, e)\n'
     '          notCopied.push(row.fileName)\n'
     '          continue\n'
     '        }\n')
b = ('        await this.r2.copyObject(row.storageKey, storageKey, { // BROKEN: a gone file fails the copy\n'
     '          contentType: row.contentType,\n'
     '          metadata: { uploadedby: actorId, taskid: toTaskId },\n'
     '        })\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-50-a-gone-file-fails-the-copy: a copy the store refuses throws')
