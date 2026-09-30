# A MESSAGE MADE UP ON THE PAGE IS SHOWN AS THE SERVER'S (`found-30-sep/download-refusals-say-no-reason`):
# `refusalMessage` does not ask whether the words were the API's, so "Download failed (404)" — or a proxy page's
# "Unexpected API response …" — is what the reader is told.
# Reddens: unit: download-file.test.ts "the caller’s words stand for a refusal not meant for the reader: a server error, a lapsed session, a page that is not the API’s"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
a = "  if (!(error instanceof ApiError) || !error.said) return fallback\n"
b = "  if (!(error instanceof ApiError)) return fallback\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('drr-5-a-made-up-message-is-shown-unit: refusalMessage ignores whether the server said it')
