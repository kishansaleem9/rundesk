# Gmail goes back to being a name the product uses and cannot connect: the tab
# stays, the "Connect" link stays, and there is no provider behind either.
# Reddens: app-catalogue: "Gmail is a provider a workspace can actually connect"
#          and "pressing Connect on Gmail opens the connect flow for Gmail"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = """      'google-drive',
      'gmail',
      'outlook',
"""
b = """      'google-drive',
      'outlook',
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('integration-connections.service.ts: gmail is no longer a connectable provider.')
