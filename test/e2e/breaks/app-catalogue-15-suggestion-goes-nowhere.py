# The suggestion dialog closes, the toast fires, and nothing leaves the browser.
# The most photogenic failure in this audit.
# Reddens: app-catalogue: "a suggestion reaches the server under the name that
#          was typed, note and all"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = """      const res = await api<unknown>(
        `/workspaces/${workspaceId}/integrations/connections/access-requests?${qs.toString()}`,
        { method: 'POST' },
      )
      return res
"""
b = """      return { ok: true, name, note }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: a suggestion is confirmed and never sent.')
