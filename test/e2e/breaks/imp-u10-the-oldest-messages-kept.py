# A SLACK CHANNEL PAST 10 000 MESSAGES KEEPS ITS OLDEST, not its newest as ClickUp does.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: unit: slack-export.test.ts "keeps the newest 10 000 messages of a channel, as ClickUp does, and says how many older ones it left"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/slack-export.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    all.sort((a, b) => compareTs(b.ts, a.ts))\n    const kept = all.slice(0, SLACK_MESSAGES_PER_CHANNEL)\n',
     '    all.sort((a, b) => compareTs(a.ts, b.ts))\n    const kept = all.slice(0, SLACK_MESSAGES_PER_CHANNEL)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imp-u10-the-oldest-messages-kept: the oldest 10 000 are kept')
