# The button on an unconnectable tile opens the connect dialog instead of
# recording the ask. It looks alive, it closes again, and nothing was written.
# Reddens: app-catalogue: "pressing it records the ask against this workspace"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = """              onClick={() => {
                if (!supported) {
                  onRequestAccess()
                  return
                }
                onOpenConnect()
              }}
"""
b = """              onClick={() => {
                onOpenConnect()
              }}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: Request access opens a dialog and writes nothing.')
