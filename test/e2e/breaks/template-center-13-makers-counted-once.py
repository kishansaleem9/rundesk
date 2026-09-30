# CREATED BY COUNTS EACH MAKER ONCE, NOT THEIR TEMPLATES (`ledger-rows/row-1874`).
#
# `count(distinct created_by_id)` in a GROUP BY on that same column is 1 in
# every bucket: the menu lists the right people and says each made one.
#
# Reddens: template-center: "Created by lists this run's two makers, each with how many they made — 7 and 3"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "        .select({ value: projectTemplates.createdById, name: users.displayName, count: sql<number>`count(*)::int` })\n"
b = ("        // BROKEN: each maker counted once\n"
     "        .select({ value: projectTemplates.createdById, name: users.displayName, count: sql<number>`count(distinct ${projectTemplates.createdById})::int` })\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-13-makers-counted-once: every Created by bucket counts 1')
