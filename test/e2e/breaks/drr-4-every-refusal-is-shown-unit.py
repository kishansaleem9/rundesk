# EVERY REFUSAL'S WORDS ARE SHOWN, WHATEVER ITS STATUS (`found-30-sep/download-refusals-say-no-reason`): a server
# error shows "Internal server error" and a lapsed session "Unauthorized" where the page's own words should stand.
# Reddens: unit: download-file.test.ts "the caller’s words stand for a refusal not meant for the reader: a server error, a lapsed session, a page that is not the API’s"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
a = "  if (error.status < 400 || error.status >= 500 || error.status === 401) return fallback\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('drr-4-every-refusal-is-shown-unit: refusalMessage shows every status')
