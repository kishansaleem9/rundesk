# REMOVING NOBODY IS AUDITED: the line is written whether or not a row went.
# Reddens: job-title-rule: "removing somebody who is not in a team writes nothing to the audit log, and removing a member writes one line"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (removed.length > 0) {\n      await this.security.logAuditEvent({\n'
b = '    if (removed.length >= 0) {\n      await this.security.logAuditEvent({\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-9-removal-audited-regardless: done')
