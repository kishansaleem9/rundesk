# ONE SENTENCE FOR TWO DIFFERENT ABSENCES. Nowhere-to-save-a-deck and
# nothing-generates-a-prototype become the same line, so a reader cannot tell
# which thing is missing. The clips guard caught its own author doing exactly
# this with two storage errors.
# Reddens: task-ai-bar: "and the two it cannot make each print their OWN reason on the surface"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    { id: 'prototype', labelKey: 'taskAiBar.prototype', reasonKey: 'taskAiBar.noPrototype' },"""
b = """    { id: 'prototype', labelKey: 'taskAiBar.prototype', reasonKey: 'taskAiBar.noPresentation' },"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: both unavailable AI-bar offers now print one shared reason.")
