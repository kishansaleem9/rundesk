# A PICKER SECTION WITH NOTHING BEHIND IT. The Whiteboards query never
# fetches, so the tab renders, the empty state renders, and the section can
# only ever say no-matches. It photographs as finished and is the facade this
# audit names first.
# Reddens: task-mentions -- 'narrowing to this runs tag leaves exactly the whiteboard this run made'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    enabled: !!workspaceId && mentionTab === 'whiteboards',"""
b = """    enabled: false,"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the Whiteboards @ section no longer fetches anything.")
