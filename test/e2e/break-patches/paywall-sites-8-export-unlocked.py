# The board export stops saying it is locked before you press it.
# Reddens: "and says up front that this one is not on your plan".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "              boardExportLocked={!featureAvailable(BOARD_EXPORT_GATE)}"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "              boardExportLocked={false}"))
print('[break 8] forced boardExportLocked to false in the list route —')
print('          the panel gives no sign the board download is paid.')
