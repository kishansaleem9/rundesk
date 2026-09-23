# THE SETTINGS FORM SHOWS EVENT IDS, NOT THEIR NAMES.
# Reddens: webhook-access: "the form offers every event the server lists, each by its name"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '                  {webhookEventLabel(t, ev)}\n                </button>\n'
b = '                  {ev}\n                </button>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-13-settings-raw-event-ids: applied")
