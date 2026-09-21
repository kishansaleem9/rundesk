# Take the Channels section back out of the workspace tree, leaving channels
# reachable only from the chat page — which you had to already be on to see
# that you had any.
# Reddens: sidebar-sections: "the workspace tree has a Channels section" (and the
#          three channel checks under it)
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                {featureEnabled(FLAGS.CHAT) && <ChannelsSection workspaceId={workspaceId} />}\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the Channels section is gone from the tree again.')
