# A DELETED (ARCHIVED) WORKSPACE STILL OPENS FOR ITS MEMBERS, by its address.
# Reddens: workspace-ownership: "a deleted workspace is gone for its members at once — not opened, not listed, its spaces not read — and its owner finds it under Archived, may delete it for good there, and can restore it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/workspace-member.guard.ts'
a = '    if (!row || (row.isArchived && !archivedAllowed())) {\n'
b = '    if (!row) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-12-a-deleted-workspace-opens: applied")
