# THE AUTOMATION BUILDER OFFERS NO “A BUTTON IS PRESSED”.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the automation builder offers “A button is pressed” with the workspace’s Buttons to wait for — not other fields — and will not save one waiting for no Button"
#
# The trigger is left out of the builder.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-automations-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  { value: 'button.clicked', labelKey: 'automations.trigger.buttonClicked' },\n",
     ""),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-w4-no-button-trigger: THE AUTOMATION BUILDER OFFERS NO “A BUTTON IS PRESSED”.')
