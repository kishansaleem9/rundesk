# The unit left unstated, so "runs" quietly becomes "actions".
# Reddens: ai-action-categories: "the heading says the unit is a run, as `ai-value.ts` insists"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = '              <p className="mt-0.5 text-[11px] text-muted-foreground">{t(\'aiValue.byCategoryUnit\')}</p>\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the grid no longer says what it is counting.')
