# The Help-centre link the frame adds is removed.
# Reddens: "the card offers a help article", "pointing at the help page",
#          "and it actually lands on a help page that renders".
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              <HelpCentreLink testId="integration-error-help" />'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '              {null}'))
print('[break 4] removed the Help-centre link from the error card —')
print('          the message has no way out of it.')
