# THE CARD AS IT WAS WHILE ITS LIST LOADS: nothing listed yet reads as "No webhooks configured yet".
# Reddens: webhook-access: "while the list loads the card does not say there are none — and then shows the two there are"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '        {whQuery.isLoading ? (\n          <InlineSkeleton />\n'
b = '        {false ? (\n          <InlineSkeleton />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-10-settings-none-while-loading: applied")
