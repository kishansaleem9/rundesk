# Direct Messages goes back to being absent from the workspace tree: the data is
# all there, the Channels section filters DMs out on purpose, and there is
# nowhere else for them — so they are reachable only from the chat page you had
# to already be on to see that you had any.
# Reddens: sidebar-dms "the workspace tree has a Direct Messages section"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                {featureEnabled(FLAGS.CHAT) && <DirectMessagesSection workspaceId={workspaceId} />}\n"
b = "                {/* BROKEN: DMs are filtered out of Channels and given no home. */}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the Direct Messages section is gone from the tree.')
