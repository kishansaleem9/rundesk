# Make a channel row open the chat page without saying WHICH conversation.
# The row still navigates, still looks right, and lands you wherever the chat
# page opens by default.
# Reddens: sidebar-sections: "a channel row opens that conversation, by its id"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '          search={{ channel: channel.id }}\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: channel rows no longer carry the channel id — every row goes to the same place.')
