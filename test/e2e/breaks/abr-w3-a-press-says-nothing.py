# A BUTTON SAYS NOTHING OF WHAT PRESSING IT RAN.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the sheet draws a Button with its words; pressing it says one automation ran and the task changed (read by SQL); a Button made from the sheet with nothing set to run says so when pressed"
#
# What the press answered is not drawn.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      {said && (\n        <span\n          data-testid={`cf-button-result-${definition.id}`}",
     "      {said && said.text.length < 0 && (\n        <span\n          data-testid={`cf-button-result-${definition.id}`}"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-w3-a-press-says-nothing: A BUTTON SAYS NOTHING OF WHAT PRESSING IT RAN.')
