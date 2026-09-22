# The upload that never uploads: presign, skip the PUT, commit the key anyway.
#
# This is the exact shape the new upload checks exist to catch, and it is the
# one a suite built on "did something happen?" cannot see. The presign goes out
# and is answered. A storage key comes back and is committed. The task's cover
# becomes a stored key, the picker closes, and the banner draws a broken image
# — or, worse on a bucket that already holds something under that key, somebody
# else's picture.
#
# WHY THIS PATCH AND NOT A SIMPLER ONE. Every cheaper break here is visible from
# the outside: remove the file input and the tab draws nothing, break the
# presign and the request 500s, throw in the handler and the error line appears.
# This one leaves every one of those looking correct. The only check that can
# disprove it is the round trip — the bytes chosen in the browser coming back
# out of the cover's own signed URL — which is why that check is worth the
# object store it took to write.
#
# PREDICTED THREE. MEASURED FOUR, and the prediction was the thing that was
# wrong — the run is written down rather than the guess.
#
# Right about the interesting pass: "asks the server to presign" and "becomes a
# STORED key" BOTH still pass, because the patched tab really does both. That is
# the facade, and it is why the round trip had to be written.
#
# Wrong about the count, because removing the PUT removes the only thing that
# can fail. The section then arranges a failure the store never gets asked for,
# so "an upload that FAILS says so in words" reddens for want of a failure, and
# "the cover is left exactly as it was" reddens because the second upload
# commits its key too. Both are honest consequences of this patch; neither was
# foreseen.
#
# MEASURED at 4ba70853, lane 2: baseline 37 passed 0 failed; this patch 33
# passed 4 failed — the PUT, the round trip, the words on failure, and the cover
# moving on a failed upload.
#
# Reddens: task-cover: "and the file itself is PUT to the URL that came back"
#          task-cover: "and the cover serves back the very bytes that were chosen, not a plausible key"
import io

p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
a = """      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
      if (!put.ok) throw new Error(`upload failed: ${put.status}`)
"""
b = """      void uploadUrl
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cover-image-picker.tsx: the cover commits a storage key nothing was ever uploaded to.')
