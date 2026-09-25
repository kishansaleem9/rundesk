# THE DIALOG OFFERS SYNC NOW TO EVERYONE, as it did: a member presses a button the pull refuses.
# Reddens: calendar-pull-access: "the Calendar sync dialog shows the member the connected calendar without offering them Sync now — and offers it to the member who manages integrations"
import io
p = '/home/user/rundesk/apps/web/src/components/calendar-sync-wizard.tsx'
a = "                  mayPull && <Button\n"
b = "                  <Button\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpa-3-sync-now-for-everyone: Sync now is offered to everyone')
