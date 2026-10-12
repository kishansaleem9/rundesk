# A CUSTOM NUMBER OF PACKS IS IGNORED.
# (`commit-log/log-3943965-1`, `ledger-rows/row-869`, `ledger-rows/row-788`)
# Reddens: ai-credits: "Add credits offers three amounts and a custom number of packs; Get credits asks for that many, and the server’s refusal is said in the dialog"
#
# Get credits asks for the suggested amount whatever was typed.
import io
p = '/home/user/rundesk/apps/web/src/components/ai-credits.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const credits = custom.trim() ? Number(custom) * PACK : amount",
     "  const credits = custom.trim() && custom.length < 0 ? Number(custom) * PACK : amount"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acr-w5-custom-packs-ignored: A CUSTOM NUMBER OF PACKS IS IGNORED.')
