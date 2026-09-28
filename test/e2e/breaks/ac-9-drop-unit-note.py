# The unit left unstated, so "runs" quietly becomes "actions".
# Reddens: ai-action-categories: "and the heading says the unit is a run, as `ai-value.ts` insists"
#
# AN ANCHOR THAT BEGINS WITH SPACES CANNOT PIN INDENTATION. This one matched
# twice: the loading skeleton repeats the card's header, and the skeleton's copy
# is indented two spaces deeper — so the 14-space anchor is a substring of the
# 16-space line as well. Both copies are correct and deliberate (the skeleton
# carries its own testid precisely so no check resolves against a placeholder),
# which is why `== 1` refused rather than the code being wrong.
#
# The fix is to anchor from the NEWLINE, which makes the indentation exact
# instead of a prefix. Every patch that anchors on an indented line has this
# hazard wherever the file has a skeleton, a mobile variant, or any second
# rendering of the same markup — and those are the files most worth breaking.
import io
p = '/home/user/rundesk/apps/web/src/components/ai-value-panel.tsx'
a = '\n              <p className="mt-0.5 text-[11px] text-muted-foreground">{t(\'aiValue.byCategoryUnit\')}</p>'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-value-panel.tsx: the grid no longer says what it is counting.')
