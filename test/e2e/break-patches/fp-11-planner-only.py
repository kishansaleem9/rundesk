# The pill shown only while you are on the planner. Frame `16:05` is the LIST
# page with the pill still in the header, and `19:05` is the AI Analytics page
# — the countdown belongs to the app shell, and one that disappears the moment
# you navigate is a planner widget wearing a header.
# Reddens: focus-pill:
#   "and the pill is still there — it belongs to the app, not to the planner"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """      {isUuidLike(params.workspaceId) && <FocusBlockPill workspaceId={params.workspaceId} />}
"""
b = """      {isUuidLike(params.workspaceId) &&
        typeof window !== 'undefined' &&
        window.location.pathname.endsWith('/calendar') && (
          <FocusBlockPill workspaceId={params.workspaceId} />
        )}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: the focus pill is rendered only on the planner route.')
