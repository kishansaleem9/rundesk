# THE FACADE. The card keeps its layout and renders a constant instead of the
# stored error — it demos perfectly and diagnoses nothing.
# Reddens: "and quotes THIS failure's own words",
#          "the second card says the SECOND provider's error and not the first's",
#          "and the first still says its own".
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "              {t('integrations.errorBody', { provider: integration.name, error: connection.lastError })}"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
b = "              {t('integrations.errorBody', { provider: integration.name, error: 'Something went wrong.' })}"
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('[break 1] replaced the stored error with a constant string in the card body —')
print('          every integration now fails for the same made-up reason.')
