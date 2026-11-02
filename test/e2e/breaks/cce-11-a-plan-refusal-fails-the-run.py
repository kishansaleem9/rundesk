# THE PLAN'S REFUSAL OF MORE PROJECTS FAILS THE WHOLE RUN instead of putting the Lists in the Space.
# Reddens: clickup-current-export: "on a plan with no projects left, a Folder’s List is made straight in the Space, and the report says why"
import io
p = '/home/user/rundesk/apps/api/src/modules/imports/import-runner.service.ts'
a = "        return instead(e.message.trim().replace(/([^.!?])$/, '$1.'))"
b = '        throw e'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-11-a-plan-refusal-fails-the-run: applied")
