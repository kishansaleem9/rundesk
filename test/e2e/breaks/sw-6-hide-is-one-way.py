# Hide dismisses the bar for good — the one-way dismissal, with nothing left on screen to undo it.
# Reddens: space-wizard: "Hide puts the bar away and there is a way back — it is not a one-way dismissal"
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '            <button\n              type="button"\n              data-testid="space-wizard-copy-show"\n              onClick={() => setCopyOpen(true)}\n              className="mt-3 text-[11px] text-muted-foreground hover:text-foreground"\n            >\n              {t(\'spaceWizard.copyShow\')}\n            </button>\n'
b = '            <span />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: Hide dismisses the bar for good — the one-way dismissal, with nothing left on screen to undo it.')
