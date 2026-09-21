# "Track completion of" stops being read: all three sources are counted however
# the field was configured. The config panel still draws its three switches,
# still saves them, and the number ignores them — the mirror defect, a stored
# value no reader honours, in the field whose whole configuration this is.
#
# Reddens: custom-field-progress:
#   "dropping subtasks leaves the checklist and the comment"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/progress.ts'
a = """  if (config.sources.subtasks) enabled.push(clean(inputs.subtasks))
  if (config.sources.checklists) enabled.push(clean(inputs.checklists))
  if (config.sources.assignedComments) enabled.push(clean(inputs.assignedComments))
"""
b = """  enabled.push(clean(inputs.subtasks))
  enabled.push(clean(inputs.checklists))
  enabled.push(clean(inputs.assignedComments))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('progress.ts: every source is counted whatever the field was configured to track.')
