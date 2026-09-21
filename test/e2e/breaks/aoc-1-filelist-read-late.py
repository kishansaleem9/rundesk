# The staged FileList is read LATE again: `addAttachments` hands the live
# `input.files` to React's updater instead of snapshotting it, and the change
# handler clears `input.value` before React ever runs that updater — so the list
# it iterates is empty and every picked file is silently dropped. The create
# modal's Attachments section can then never draw a row, for any file.
# Reddens: attach-on-create: "two files staged draw two rows"
#          attach-on-create: "and each row names ITS OWN file, in the order they were picked"
#          attach-on-create: "under an Attachments heading, as the frame draws it"
import io

p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    const chosen = Array.from(picked)"
b = "    const chosen = picked as unknown as File[]"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the picked files are read after the input has been cleared again.')
