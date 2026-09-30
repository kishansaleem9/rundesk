# ONE VALUE THE FIELD REFUSES REFUSES THE WHOLE TEMPLATE (`found-30-sep/template-values-written-unchecked`).
# The route's refusal is passed on instead of leaving that one field unset: applying a template
# whose Estimate is words, where the Estimate is a Number, answers 400 — after the task has been
# made — and none of the values its fields could hold is written onto it.
# Reddens: create-modal-templates: "and words that are no address, where that field is an Email field, leave it unset — as its route refuses them (400) — while the Note, a Text field there too, is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = ("        (err: unknown) => {\n"
     "          if (err instanceof BadRequestException) return null\n"
     "          throw err\n"
     "        },\n")
b = ("        (err: unknown) => {\n"
     "          throw err // BROKEN: one refused value refuses the template\n"
     "        },\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tvu-2-one-refusal-refuses-the-template: a template with one refused value answers 400 and writes none of its values')
