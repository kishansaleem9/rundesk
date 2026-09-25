# THE INVITE STEP STARTS ON GENERAL, AS IT DID: the lone admin lands away from the invite form.
# Reddens: settings-tabs-by-key: "the onboarding checklist’s Invite step starts on Settings’ Members tab, where the invite form is — not on General"
import io
p = '/home/user/rundesk/apps/web/src/components/onboarding-checklist.tsx'
s = io.open(p, encoding='utf-8').read()
a = '<Link to="/app/$workspaceId/settings" params={{ workspaceId }} search={{ tab: \'members\' }} data-testid="onboarding-invite-start">'
b = '<Link to="/app/$workspaceId/settings" params={{ workspaceId }} data-testid="onboarding-invite-start">'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('stp-12-invite-step-starts-on-general: the Invite step links to General')
