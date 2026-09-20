# Two pills in the header. They are two independent subscribers to the same
# state so they happen to agree today, but the count is the thing that catches
# a shell that mounts the countdown more than once — and two countdowns is the
# defect this row was most likely to introduce.
# Reddens: focus-pill: "and there is exactly one of it"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """      {isUuidLike(params.workspaceId) && <FocusBlockPill workspaceId={params.workspaceId} />}
"""
b = """      {isUuidLike(params.workspaceId) && <FocusBlockPill workspaceId={params.workspaceId} />}
      {isUuidLike(params.workspaceId) && <FocusBlockPill workspaceId={params.workspaceId} />}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: the header now mounts the focus pill twice.')
