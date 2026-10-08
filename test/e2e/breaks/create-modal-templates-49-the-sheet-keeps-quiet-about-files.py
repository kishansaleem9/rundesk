# THE SHEET SAYS "DUPLICATED" WHEN A FILE WAS LEFT OUT, though the answer names it.
# (`found-30-sep/duplicate-copies-no-attachments`, batch 19)
# Reddens: create-modal-templates: "and a stored file whose object is gone is left out of the copy and named in a warning, the copy made all the same"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "      if (notCopied.length) toast.warning(t('duplicateTask.filesNotCopied', { files: notCopied.join(', ') }))\n"
b = "      if (notCopied.length < 0) toast.warning(t('duplicateTask.filesNotCopied', { files: notCopied.join(', ') })) // BROKEN: the sheet keeps quiet\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-49-the-sheet-keeps-quiet-about-files: the sheet never warns of a file left out')
