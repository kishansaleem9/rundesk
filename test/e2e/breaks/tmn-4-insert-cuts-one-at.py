# THREE @s LEFT IN THE COMMENT. The insert cuts back to the LAST @ rather
# than to the token's start, so choosing a whiteboard after typing @@@@
# leaves @@@Whiteboard:... in the box.
# Reddens: task-mentions -- "the whole prefix is cut, not just its last character"
#   — the sentence is a template literal (`choosing it writes exactly
#   "${value.trim()}" — …`), so the claim quotes the part that is really
#   in the file rather than the rendered value
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    const cut = /(@+[/#]?)([^\s@/#]*)$/.exec(text)
    const prefix = cut ? text.slice(0, cut.index) : text"""
b = """    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: a labelled mention now cuts back to the last @ only.")
