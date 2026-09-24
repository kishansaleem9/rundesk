# CLOSE THE DIALOG WHATEVER THE SERVER SAYS, so a refusal has to be retyped
# your way back to.
#
# RE-AIMED 24 September. It closed the sidebar's own folder dialog on a
# refusal; the sidebar opens the Create menu's Folder form now
# (`commit-log/log-a0b4108-1`), so this closes that form on its error.
# Reddens: folder-create: "and the dialog stays open with the rejected name still in the box"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.folderFailed')),\n"
b = "    onError: (e) => { toast.error(e instanceof Error ? e.message : t('quickCreate.folderFailed')); onClose() },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folder-create-11-dialog-closes-on-error: the Folder form closes on a refusal')
