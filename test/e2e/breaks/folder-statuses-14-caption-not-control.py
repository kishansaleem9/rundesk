# The frame draws `Statuses` with a `›` beside it. Make the row a CAPTION
# instead of a control — the value is still shown, the chevron's claim that it
# can be changed is not honoured. This is the frame's own words on a dead
# control, and in a screenshot it is indistinguishable from the real thing.
# Reddens: folder-dialog: "the dialog carries a Statuses control, as the frame's Settings block draws"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """          <select
            data-testid="quick-create-folder-status-scope"
            value={statusScope}
            onChange={(e) => setStatusScope(e.target.value === 'list' ? 'list' : 'space')}
            className="h-8 shrink-0 rounded-md border border-border bg-card px-2 text-[12px]"
          >
            <option value="space">{t('quickCreate.folderStatusesSpace')}</option>
            <option value="list">{t('quickCreate.folderStatusesOwn')}</option>
          </select>
"""
b = """          <span className="h-8 shrink-0 px-2 text-[12px] leading-8 text-muted-foreground">
            {t('quickCreate.folderStatusesSpace')}
          </span>
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Statuses is a caption now — it reads "Use Space statuses" and cannot be changed.')
