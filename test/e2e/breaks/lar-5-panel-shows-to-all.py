# THE EMAIL PANEL OFFERS EVERY READER THE ADDRESS, or a button to make one.
# Reddens: list-address-readers: ", { waitUntil: 'domcontentloaded' }) await page.getByTestId('list-email-button').click({ timeout: 20_000 }).catch(() => {}) const dialog = page.getByRole('dialog') await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}) await page.waitForTimeout(2500) // The address is drawn in a read-only box, whose value no text read sees. const shown = await dialog.locator('input[readonly]').evaluateAll((els) => els.map((e) => e.value)).catch(() => []) return { open: await dialog.count().catch(() => -1), address: shown.includes(p.address), generate: await dialog.getByRole('button', { name: /^Generate address$/ }).count().catch(() => -1), withheld: await page.getByTestId('list-email-address-withheld').count().catch(() => -1), } } const pv = await panel(VIEW) const pf = await panel(FULL) chk( pv.open === 1 && !pv.address && pv.generate === 0 && pv.withheld === 1 && pf.address && pf.withheld === 0, 'the Email panel shows the address only to those who may add: in the view-only list it says why there is none, with nothing to generate, and at Full edit it shows it',"
import io
p = '/home/user/rundesk/apps/web/src/components/list-email-alias-panel.tsx'
a = '          {!mayAddTasks ? (\n'
b = '          {false ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lar-5-panel-shows-to-all: applied')
