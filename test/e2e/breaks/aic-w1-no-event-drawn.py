# THE PREVIEW DRAWS NO EVENT.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "the Commands tab drafts the event for her to confirm — its title, its time in her own zone, whom it invites — and nothing is in her calendar yet"
#
# A label, and none of what will be written: no time in her zone, nobody it invites.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (action.tool === 'create_calendar_event') {\n    const zone = asText(a.timeZone) || 'UTC'\n",
     "  if (action.tool === 'create_calendar_event' && action.tool !== 'create_calendar_event') {\n    const zone = asText(a.timeZone) || 'UTC'\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-w1-no-event-drawn: the event is not drawn in the preview')
