# THE HINT THAT CANNOT BE FOLLOWED. The token reader looks at ONE @ instead
# of the run, so the footer still prints @@@@ for Whiteboards and typing it
# lands on People. An instruction printed on a surface that cannot follow it
# is the Priorities-rail defect in a smaller box.
# Reddens: task-mentions: "typing the footer's own `@@@@` moves the picker to Whiteboards — the hint is followable"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """  const m = /(@+[/#]?)([^\s@/#]*)$/.exec(text)"""
b = """  const m = /(@[/#]?)([^\s@/#]*)$/.exec(text)"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the @ token reader now sees only the last @.")
