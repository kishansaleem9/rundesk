# A tile the product fills, said to be one it cannot.
# Reddens: ai-action-categories: "two are marked as something this product cannot do — the connected apps’ — and Images generated, which image generation fills, is not"
#   or "with a DIFFERENT reason each — one shared reason explains nothing"
#   or "two tiles admit the product cannot fill them"
#   or "and none of them prints a number a person could mistake for a count"
#
# Re-aimed 8 October: the last 3 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost.
#
# Re-aimed 8 October: this was `ac-5-images-look-supported`, a confident zero on a tile nothing could fill.
# Image generation fills it now (`ledger-rows/row-870`), so the break runs the other way: "not available" over runs.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = "  externalActions: 'aiValue.reasonNoConnectedAppActions',\n"
b = "  images: 'aiValue.reasonNoImageGeneration',\n" + a
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: Images generated is reported as something this product cannot do, though image generation fills it.')
