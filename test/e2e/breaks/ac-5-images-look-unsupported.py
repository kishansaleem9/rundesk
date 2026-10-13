# A tile the product fills, said to be one it cannot.
# Reddens: ai-action-categories: "none is marked as something this product cannot do — the connected apps’ tiles count the AI’s runs in them, as Images generated counts image generation’s"
#   or "and none carries a reason it cannot be filled"
#   or "no tile admits the product cannot fill it — the connected apps’ two are filled like the rest"
#
# Re-aimed 8 October: this was `ac-5-images-look-supported`, a confident zero on a tile nothing could fill.
# Image generation fills it now (`ledger-rows/row-870`), so the break runs the other way: "not available" over runs.
#
# Re-aimed 13 October: no category is unsupported since the AI acts in a person's connected apps
# (`ledger-rows/row-2294`), so the list it joined is empty and Images generated is put in it alone.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = "export const UNSUPPORTED_CATEGORIES: Readonly<Record<string, string>> = {}\n"
b = "export const UNSUPPORTED_CATEGORIES: Readonly<Record<string, string>> = {\n  images: 'aiValue.reasonNoImageGeneration',\n}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: Images generated is reported as something this product cannot do, though image generation fills it.')
