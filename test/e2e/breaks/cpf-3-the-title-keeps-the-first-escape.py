# THE FIRST ESCAPE IS SPENT BEFORE IT REACHES THE CREATOR: THE TASK TITLE STOPS IT.
#
# The modal closes on an Escape that reaches the document. Before
# `found-29-sep/comment-plus-menu-keeps-focus-after-create` the "+" menu, still
# mounted under the creator, took the first one and marked it handled; here the
# title the cursor is in keeps it to itself, as a field that clears on Escape
# would. Either way one Escape closes nothing and the creator stays over the
# page.
#
# Reddens: comment-plus-menu: "and ONE Escape closes the creator — nothing left under it takes the key first"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """        data-testid="quick-create-task-title"
        placeholder={t('quickCreate.taskTitlePlaceholder')}
"""
b = """        data-testid="quick-create-task-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.stopPropagation()
        }}
        placeholder={t('quickCreate.taskTitlePlaceholder')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the task title keeps the first Escape, so the creator stays open.')
