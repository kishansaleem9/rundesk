# THE SIDEBAR'S NEW FOLDER DOES NOTHING: pressed, nothing opens, nothing is
# sent and nothing is said.
#
# RE-AIMED 24 September. It silenced the sidebar's own folder dialog, which is
# gone: the sidebar opens the Create menu's Folder form now
# (`commit-log/log-a0b4108-1`), whose silence is `folder-create-9`'s. A button
# that does nothing is the sidebar path's own way to be silent.
# Reddens: folder-create: "the sidebar path reports the refusal with the same words"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                      onClick={() => setSpaceCreate({ spaceId: space.id, kind: 'folder' })}\n"
b = '                      onClick={() => undefined}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("folder-create-10-sidebar-silent: the sidebar's New folder does nothing")
