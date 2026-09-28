# THE EMAIL PANEL OFFERS EVERY READER THE ADDRESS, or a button to make one.
# Reddens: list-address-readers: "the Email panel shows the address only to those who may add: in the view-only list it says why there is none, with nothing to generate, and at Full edit it shows it"
import io
p = '/home/user/rundesk/apps/web/src/components/list-email-alias-panel.tsx'
a = '          {!mayAddTasks ? (\n'
b = '          {false ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lar-5-panel-shows-to-all: applied')
