# THE BAR AS A ROW OF THREE PROMISES. Every offer becomes live, so
# presentation and prototype look pressable while nothing in Rundesk can save a
# slide deck or generate a mock. The facade in its purest form: it photographs
# perfectly and cannot do two of the three things it says.
# Reddens: task-ai-bar: "exactly one of the three is offered for real, and it is the one Rundesk can make: a doc"
#   or "and the two it cannot make each print their OWN reason on the surface"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    { id: 'presentation', labelKey: 'taskAiBar.presentation', reasonKey: 'taskAiBar.noPresentation' },
    { id: 'document', labelKey: 'taskAiBar.document', reasonKey: null },
    { id: 'prototype', labelKey: 'taskAiBar.prototype', reasonKey: 'taskAiBar.noPrototype' },"""
b = """    { id: 'presentation', labelKey: 'taskAiBar.presentation', reasonKey: null },
    { id: 'document', labelKey: 'taskAiBar.document', reasonKey: null },
    { id: 'prototype', labelKey: 'taskAiBar.prototype', reasonKey: null },"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: all three AI-bar offers now look available.")
