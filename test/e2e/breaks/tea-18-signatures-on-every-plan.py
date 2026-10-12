# SIGNATURES AND TEMPLATES ON EVERY PLAN.
# (`found-9-oct/task-email-sends-from-the-server`)
# Reddens: task-email-accounts: "a person keeps signatures, one of them the default — made the default, the other is not (read by SQL); they are theirs alone, and on Pro there are none (403, in words)"
#
# The plan is not asked.
import io
p = '/home/user/rundesk/apps/api/src/modules/email-accounts/email-accounts.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!email.signaturesAndTemplates) throw new ForbiddenException(EMAIL_PLAN_REFUSALS.signaturesAndTemplates(planLabel))',
     '    if (false) throw new ForbiddenException(EMAIL_PLAN_REFUSALS.signaturesAndTemplates(planLabel))'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tea-18-signatures-on-every-plan: SIGNATURES AND TEMPLATES ON EVERY PLAN.')
