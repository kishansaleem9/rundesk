# OPENAI_API_KEY IS NOT READ: A SERVER WITH ONLY THAT KEY SAYS IMAGES ARE NOT SET UP.
# (`ledger-rows/row-870`)
# Reddens: unit: image-generation.test.ts "with no key, image generation is not set up; IMAGES_API_KEY, else OPENAI_API_KEY, sets it up — at OpenAI and with gpt-image-1 unless told otherwise"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/image-generation.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const key = (env.IMAGES_API_KEY?.trim() || env.OPENAI_API_KEY?.trim()) ?? ''\n",
     "  const key = (env.IMAGES_API_KEY?.trim() || env.IMAGES_NO_FALLBACK?.trim()) ?? '' // BROKEN: no fallback\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-9-no-fallback-key-unit: OPENAI_API_KEY IS NOT READ: A SERVER WITH ONLY THAT KEY SAYS IMAGES ARE NOT SET UP.')
