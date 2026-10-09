# A PICTURE MADE IS NOT WRITTEN DOWN AS A RUN.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "each ask is one run of `image.generate`, and the AI value report counts it under Images generated, a tile it now fills"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      void this.recordUsage('image.generate', cfg.model, ctx, 0, 0)\n",
     '      void cfg // BROKEN: the run is not written\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-3-a-run-is-not-written: a run is not written')
