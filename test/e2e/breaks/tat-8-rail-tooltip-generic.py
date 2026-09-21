# THE TOOLTIP THE FRAME DRAWS, REPLACED BY A GENERIC ONE. An icon rail is
# unreadable without its labels, and frames 06:05-06:08 exist because the
# tooltip IS the control's name.
# Reddens: task-attachments -- 'the icon is there and its tooltip reads Related items'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    title={t('taskDetail.relatedItemsTooltip')}
                    aria-label={t('taskDetail.relatedItemsTooltip')}"""
b = """                    title={t('taskDetail.open')}
                    aria-label={t('taskDetail.open')}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the rail icon tooltip is now a generic word.")
