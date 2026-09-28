# The pill moved to the right-hand tool rail, among the theme toggle and the
# bell. Every frame from `15:20` to `19:05` puts it at the LEFT of the header,
# immediately right of the workspace switcher — which is where you read it
# without looking for it.
# Reddens: focus-pill: "it sits in the app header, immediately right of the workspace identity"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """      {isUuidLike(params.workspaceId) && <FocusBlockPill workspaceId={params.workspaceId} />}
      <div className="flex-1" />
"""
b = """      <div className="flex-1" />
      {isUuidLike(params.workspaceId) && <FocusBlockPill workspaceId={params.workspaceId} />}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: the focus pill now sits with the right-hand tools instead of beside the workspace name.')
