# A REFUSED DOWNLOAD IS READ FOR ITS STATUS ALONE (`found-30-sep/download-refusals-say-no-reason`): `downloadFile`
# throws "Download failed (<status>)" and never reads the refusal's envelope, so Download all past its cap says
# only "Could not download the attachments", as it did.
# Reddens: task-attachments: "a task whose files come to more than a zip holds is refused in the server's own words — how much, what a zip holds, one at a time — and nothing is saved"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
a = "    if (newToken) res = await fetchWithAuth(path, { method: 'GET' }, newToken)\n    else useAuthStore.getState().clear()\n  }\n  if (!res.ok) throw await downloadRefused(res)\n"
b = "    if (newToken) res = await fetchWithAuth(path, { method: 'GET' }, newToken)\n    else useAuthStore.getState().clear()\n  }\n  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('drr-1-the-download-reads-only-the-status: downloadFile throws "Download failed (<status>)"')
