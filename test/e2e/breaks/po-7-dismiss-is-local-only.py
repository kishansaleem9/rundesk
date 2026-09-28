# Dismissal hides the panel for this tab and is never stored, so it returns on the
# next device and on the next load. Postponed, not dismissed.
# Reddens: planner-onboarding: "dismissing it stores the dismissal on the account and takes the panel away"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '            onDismiss={() => dismissOnboarding.mutate()}\n'
b = '            onDismiss={() => {}}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: dismissing the panel stores nothing.')
