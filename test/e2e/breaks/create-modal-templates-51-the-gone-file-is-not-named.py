# A FILE THE STORE COULD NOT COPY IS LEFT OUT IN SILENCE.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and a stored file whose object is gone is left out of the copy and named in a warning, the copy made all the same"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ('          console.error(`[tasks.copyAttachmentsTo] ${row.storageKey} was not copied:`, e)\n'
     '          notCopied.push(row.fileName)\n'
     '          continue\n')
b = ('          console.error(`[tasks.copyAttachmentsTo] ${row.storageKey} was not copied:`, e)\n'
     '          continue // BROKEN: the gone file is not named\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-51-the-gone-file-is-not-named: a file left out is not named')
