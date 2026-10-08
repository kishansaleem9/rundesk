# A TEMPLATE'S VALUES ARE WRITTEN UNCHECKED AGAIN, as `tvu-1`, for the unit test that reads
# what `instantiate` writes (`found-30-sep/template-values-written-unchecked`).
# Re-aimed 8 October: values left out are named in the answer (`found-30-sep/template-leaves-values-out-silently`).
# Reddens: unit: task-templates.service.test.ts "writes no words into a Number field, no option a Dropdown does not define and no words into an Email field, and writes the values its fields can hold"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ("      const taken = await this.customFields.checkValue(workspaceId, taskId, def, value).then(\n"
     "        (checked) => ({ checked }),\n"
     "        (err: unknown) => {\n"
     "          if (err instanceof BadRequestException) {\n"
     "            leftOut.push({ field: def.name, reason: err.message })\n"
     "            return null\n"
     "          }\n"
     "          throw err\n"
     "        },\n"
     "      )\n")
b = "      const taken = { checked: value } // BROKEN: written as it came, the field's rules not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tvu-3-template-writes-one-value-unchecked-unit: a template writes its values without asking the field\'s rules')
