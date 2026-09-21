# The switches leave the saved view's config, so they reset on every reload
# and the Save-view chip never notices them.
# Reddens: "changing one marks the view unsaved", "saving the view writes it".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    stackFields,\n    showEmptyFields,\n    collapseEmptyColumns,\n'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('[break 7] The three switches are page state again, not view state.')
