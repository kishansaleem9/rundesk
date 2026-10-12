# PRESSING ONE BUTTON RUNS EVERY BUTTON’S AUTOMATIONS.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "pressing a Button on a task runs the automation it triggers for that task, as the presser (read by SQL) — not another Button’s — and a Button holds no value to set"
#   or "the sheet draws a Button with its words; pressing it says one automation ran and the task changed (read by SQL); a Button made from the sheet with nothing set to run says so when pressed"
#
# Measured 12 October: the last of these is a knock-on of the same edit, measured on lane 10 — a check that stands on what the first one lost.
#
# A button rule is not asked which button it waits for.
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (t.type === BUTTON_TRIGGER && t.filters?.fieldId !== ctx.fieldId) return false\n",
     ""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-9-a-press-runs-every-button-rule: PRESSING ONE BUTTON RUNS EVERY BUTTON’S AUTOMATIONS.')
