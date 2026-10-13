# THE PREVIEW SAYS THE EVENT'S TIME IN UTC.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "the Commands tab drafts the event for her to confirm — its title, its time in her own zone, whom it invites — and nothing is in her calendar yet"
#
# Labelled with her zone, drawn in UTC: 05:00 where she asked for 10:00.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })\n",
     "      new Intl.DateTimeFormat('en-US', { timeZone: timeZone ? 'UTC' : 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-w4-the-time-in-utc: the preview draws the time in UTC')
