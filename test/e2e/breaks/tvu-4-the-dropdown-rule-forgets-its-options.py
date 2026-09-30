# THE FIELD'S OWN RULE FORGETS A DROPDOWN'S OPTIONS (`found-30-sep/template-values-written-unchecked`).
# The rule is stated once (`CustomFieldsService.checkValue`) and the template asks it rather than a
# copy, so breaking it breaks both writers at once: the route takes an option the Dropdown does
# not define, and so does a template applied where the field of that name lacks it.
# Reddens: create-modal-templates: "and its option, where that field is a Dropdown without it, leaves the Dropdown unset — as its route refuses it (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "          if (typeof value !== 'string' || !opts.some((o) => o.value === value)) {\n"
b = "          if (typeof value !== 'string') { // BROKEN: any string, defined or not\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tvu-4-the-dropdown-rule-forgets-its-options: a Dropdown takes any string, through its route and from a template')
