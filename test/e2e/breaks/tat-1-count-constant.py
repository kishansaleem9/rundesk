# A COUNT THAT CAN ONLY EVER SAY ONE THING. The header reports a literal, so
# it is right for a task with one attachment and wrong for every other task,
# in a way nobody notices from a screenshot.
# Reddens: task-attachments: "the header carries the frame's count — 3, drawn as well as recorded"
#   or "and the header's count follows the removal rather than staying where it was drawn"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        data-count={attachments.length}
      >
        <span className="text-sm font-medium">{t('taskDetail.tab.attachments')}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{attachments.length}</span>"""
b = """        data-count={1}
      >
        <span className="text-sm font-medium">{t('taskDetail.tab.attachments')}</span>
        <span className="text-xs text-muted-foreground tabular-nums">1</span>"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the attachments header count is now a constant.")
