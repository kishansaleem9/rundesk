# A TEMPLATE'S VALUES ARE WRITTEN UNCHECKED AGAIN (`found-30-sep/template-values-written-unchecked`).
# The field route's rules are not asked: a template's words go into a Number field of the same
# name, an option into a Dropdown that does not define it, and words into an Email field.
# Reddens: create-modal-templates: "a template’s words, applied where the field of that name is a Number, leave that field unset — as the field’s own route refuses them (400), read by SQL"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ("      const taken = await this.customFields.checkValue(workspaceId, taskId, def, value).then(\n"
     "        (checked) => ({ checked }),\n"
     "        (err: unknown) => {\n"
     "          if (err instanceof BadRequestException) return null\n"
     "          throw err\n"
     "        },\n"
     "      )\n")
b = "      const taken = { checked: value } // BROKEN: written as it came, the field's rules not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tvu-1-template-writes-one-value-unchecked: a template writes its values without asking the field\'s rules')
