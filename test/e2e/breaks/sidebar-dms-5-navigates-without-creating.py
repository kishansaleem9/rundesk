# Choosing somebody navigates to the chat page and never asks the server for the
# conversation. On an account that already has that DM it is indistinguishable
# from working; on one that does not, the button does nothing at all.
# Reddens: sidebar-dms "choosing somebody really starts the conversation — their id left the browser in a POST"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """      const created = await api<{ id: string }>(`/workspaces/${workspaceId}/chat/dms`, {
        method: 'POST',
        body: { peerUserId },
      })
"""
b = "      // BROKEN: never asks the server for the conversation.\n      const created = { id: '' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: "+ New message" navigates without creating anything.')
