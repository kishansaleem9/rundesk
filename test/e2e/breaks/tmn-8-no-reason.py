# GREYED OUT AND SILENT. The Email row loses its reason, so a reader meets a
# disabled control with no explanation and goes looking for a setting that
# does not exist.
# Reddens: task-mentions -- 'the row itself says why'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                  <span
                    data-testid="comment-mode-reason-email"
                    className="pl-6 text-[10px] leading-snug text-muted-foreground"
                  >
                    {t('taskDetail.commentModeEmailReason')}
                  </span>"""
b = """                  <span
                    data-testid="comment-mode-reason-email"
                    className="pl-6 text-[10px] leading-snug text-muted-foreground"
                  />"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the disabled Email mode no longer says why.")
