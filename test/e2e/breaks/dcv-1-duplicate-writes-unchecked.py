# A DUPLICATE WRITES EVERY VALUE THE TASK HELD ONTO ITS COPY, UNCHECKED, as it did
# (`found-30-sep/duplicate-copies-votes-and-files`): the original's votes, cast by people who
# never saw the copy, and its Files value, naming attachments the copy does not have.
# Reddens: custom-field-progress: "a duplicate of the task carries none of its votes — a vote is cast by its voter on the task they voted on (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    await this.materialiseTemplateValues(task.id, { projectId: ctx.projectId, listId: ctx.listId }, workspaceId, payload.customFieldValues)\n"
b = ("    {\n"
     "      // BROKEN: every value the task held, written onto the copy unchecked\n"
     "      const defs = await this.db\n"
     "        .select({ id: customFieldDefinitions.id, name: customFieldDefinitions.name })\n"
     "        .from(customFieldDefinitions)\n"
     "        .where(eq(customFieldDefinitions.projectId, ctx.projectId))\n"
     "      const byName = new Map(defs.map((d) => [d.name, d.id]))\n"
     "      const rows = payload.customFieldValues.flatMap((v) =>\n"
     "        byName.has(v.fieldName) ? [{ taskId: task.id, fieldId: byName.get(v.fieldName)!, value: { v: v.value ?? null } as any }] : [])\n"
     "      if (rows.length) await this.db.insert(customFieldValues).values(rows)\n"
     "    }\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dcv-1-duplicate-writes-unchecked: a duplicate copies every value unchecked, votes and files among them')
