# EMAIL IS DISABLED AND SAYS NOTHING OF WHY.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "Comment ▾ lists Email disabled, saying it is off and who turns it on"
#
# A reader meets Email greyed out with no word of the ClickApp or who turns it on.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                      {emailUnavailableReason(t, emailSetup.data, emailSetup.isError)}\n',
     "                      {''}\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-w1-off-says-nothing: EMAIL IS DISABLED AND SAYS NOTHING OF WHY.')
