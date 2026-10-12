# A BUTTON TAKES A VALUE.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "pressing a Button on a task runs the automation it triggers for that task, as the presser (read by SQL) — not another Button’s — and a Button holds no value to set"
#
# The value route does not refuse a Button.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (def.type === 'button') throw new BadRequestException(BUTTON_HOLDS_NOTHING)\n",
     ""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-12-a-button-holds-a-value: A BUTTON TAKES A VALUE.')
