# THE PATCH THAT PROVES THE CHECK IS ABOUT THE GRID.
# The switch still flips, still saves into the view, and the card still
# reports data-stacked="true" — only the class that DRAWS the stack is
# reverted. Every "the toggle is on" assertion passes on this build.
# Reddens: list-customize: "and every field starts below the last ("
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "              stackFields ? 'flex flex-col items-start gap-1' : 'flex items-center gap-2 flex-wrap',"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "              'flex items-center gap-2 flex-wrap',"))
print('[break 1] Stack fields still toggles and still saves; the card never stacks.')
