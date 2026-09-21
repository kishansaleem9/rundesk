# THE SHORTCUT THAT EATS THE TEXT. The empty-box guard goes, so every space
# anywhere in a comment opens the AI panel and swallows the character.
# planner-views shipped this exact bug and its check passed anyway until it
# asserted the TEXT THAT ARRIVED.
# Reddens: task-ai-bar -- 'with words in the box a space is just a space'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            if (e.key === ' ' && text === '' && !aiOpen) {"""
b = """            if (e.key === ' ' && !aiOpen) {"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: space now opens the AI panel even mid-sentence.")
