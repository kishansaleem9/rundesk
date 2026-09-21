# The refusal removed, so "Progress (Auto)" can be written directly. A field
# called Auto that accepts a hand-set value is not automatic — it is a number
# that happens to be right once, and goes stale the moment anybody ticks a
# checklist item. Nothing errors, and the column quietly stops being derived.
#
# Reddens: custom-field-progress:
#   "setting it directly is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = """    if (def.type === 'progress_auto') {
      throw new BadRequestException(
        'Progress (Auto) is calculated from subtasks, checklists and assigned comments — it cannot be set directly',
      )
    }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: Progress (Auto) accepts a hand-set value.')
