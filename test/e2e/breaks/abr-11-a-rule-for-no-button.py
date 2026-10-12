# A “BUTTON IS PRESSED” RULE NEED NAME NO BUTTON.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a “button is pressed” rule must name a Button (400, in words, for none or a field that is not one); a reader of the task is refused the press and nothing runs; a field that is not a Button is not pressed"
#
# The trigger is stored as sent.
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    await this.assertButtonTrigger(workspaceId, trigger)\n",
     ""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-11-a-rule-for-no-button: A “BUTTON IS PRESSED” RULE NEED NAME NO BUTTON.')
