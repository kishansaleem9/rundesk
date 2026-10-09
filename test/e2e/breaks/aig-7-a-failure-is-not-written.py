# A FAILED ASK IS NOT WRITTEN DOWN AS A FAILED RUN.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "the service’s rate limit is said as too many requests (429), its failure as a service that did not answer (502), and each is written down as a failed run"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      await this.recordFailure('image.generate', cfg.model, ctx, 'provider_error', said)\n",
     '      void said // BROKEN: the failure is not written\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-7-a-failure-is-not-written: a failure is not written')
