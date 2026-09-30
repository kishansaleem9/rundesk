# A WORKSPACE TAGS A BUILT-IN (`ledger-rows/row-1874`).
#
# A built-in is one row shown to every workspace: a tag one workspace writes on
# it appears in everybody's Template Center. (The suite puts the row back by
# SQL afterwards, since the route itself refuses to.)
#
# TWO ANCHORS, because the service keeps two guards. Removing the refusal alone
# was measured: the update, scoped to the caller's workspace, matched no row
# and answered 404 "Template not found", and the built-in kept its tags. So the
# defect here is the pair — no refusal, and an update by id alone.
#
# Reddens: template-center: "a built-in, shown to every workspace, cannot be tagged from one — 400, \"A built-in template cannot be tagged\" — and keeps what it had"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a1 = "    if (tpl.isBuiltIn || !tpl.workspaceId) throw new BadRequestException('A built-in template cannot be tagged')\n"
b1 = "    // BROKEN: a built-in may be tagged\n"
a2 = "      .where(and(eq(projectTemplates.id, tpl.id), eq(projectTemplates.workspaceId, workspaceId)))\n"
b2 = "      .where(eq(projectTemplates.id, tpl.id)) // BROKEN: by id alone\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a1) == 1, f'anchor 1 appears {s.count(a1)} times in {p}, expected exactly 1'
assert s.count(a2) == 1, f'anchor 2 appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a1, b1).replace(a2, b2))
print('template-center-33-built-ins-tagged: a built-in takes a workspace\'s tags')
