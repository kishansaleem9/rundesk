# The section renders ABOVE Channels instead of below it. Both frames stack them
# the other way and `[06:21]` says them in that order — "channels, direct
# messages, aur spaces" — so a section that merely exists somewhere in the column
# is not the section the frame draws.
# Reddens: sidebar-dms "and it sits below Channels, as both frames stack them"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = "                {featureEnabled(FLAGS.CHAT) && <ChannelsSection workspaceId={workspaceId} />}\n"
b = (
    "                {/* BROKEN: drawn above Channels, against both frames. */}\n"
    "                {featureEnabled(FLAGS.CHAT) && <DirectMessagesSection workspaceId={workspaceId} />}\n"
    "                {featureEnabled(FLAGS.CHAT) && <ChannelsSection workspaceId={workspaceId} />}\n"
)
c = "                {featureEnabled(FLAGS.CHAT) && <DirectMessagesSection workspaceId={workspaceId} />}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
assert s.count(c) == 1, f'second anchor appears {s.count(c)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(c, '').replace(a, b))
print('workspace-sidebar.tsx: Direct Messages now sits above Channels.')
