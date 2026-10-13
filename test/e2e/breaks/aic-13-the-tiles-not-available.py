# THE CONNECTED APPS' TILES SAY THE PRODUCT CANNOT FILL THEM.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "External app actions and External app searches are filled tiles, not “not available” — the runs that reached her calendar, her mailbox and her Drive are counted there (read by SQL)"
#
# Marked unsupported again: "not available" printed over runs that happened.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('export const UNSUPPORTED_CATEGORIES: Readonly<Record<string, string>> = {}\n',
     "export const UNSUPPORTED_CATEGORIES: Readonly<Record<string, string>> = {\n  externalActions: 'aiValue.reasonNoConnectedAppActions',\n  externalSearches: 'aiValue.reasonNoConnectedAppSearch',\n}\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("aic-13-the-tiles-not-available: the connected apps' tiles are unsupported again")
