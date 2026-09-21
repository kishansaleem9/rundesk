# The Create-a-Space dialog goes back to Continue alone — no way to start from a template from the one dialog where it is obviously worth offering.
# Reddens: space-wizard: the Create-a-Space dialog offers Use Templates beside Continue
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '          <button\n            type="button"\n            onClick={() => setPanel(\'templates\')}\n            data-testid="space-wizard-use-templates"\n            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"\n          >\n            <Layers className="h-3.5 w-3.5" aria-hidden />\n            {t(\'spaceWizard.useTemplates\')}\n          </button>\n'
b = '          <span />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: The Create-a-Space dialog goes back to Continue alone — no way to start from a template from the one dialog where it is obviously worth offering.')
