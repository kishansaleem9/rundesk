# AN EVENT IS PLANNED FOR SOMEBODY WITH NO CALENDAR.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "a person with no calendar connected is told so in words — and where to connect one — and nothing is written"
#
# The preview offers what the confirm then cannot do, and says nothing of where to connect one: a
# person with none is taken to have a Google Calendar.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-connected.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const calendar = connected?.calendar\n',
     "  const calendar = connected?.calendar ?? { provider: 'gcal' as const, email: null }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-10-a-calendar-assumed: an event is planned with no calendar to write it to')
