# The Holidays chips stay on the grid whatever the picker says, so the checkbox
# stores a row nobody reads. §V2-02d seen from the other side.
# Reddens: calendar-accounts: "unticking Holidays drops the chip by one and is remembered"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '                {holidayCalendarOn &&\n'
b = '                {true &&\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the Holidays calendar cannot be turned off.')
