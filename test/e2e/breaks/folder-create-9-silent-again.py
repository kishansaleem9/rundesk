# THE ONE THE ROW IS ABOUT: make the folder-create error path silent again.
# Remove the Folder tab's onError, exactly as commit 88830db found it on the
# List tab beside it. The server still refuses; the dialog says nothing and
# sits there with the button looking un-pressed.
# Reddens: folder-create: "the refusal reaches the person as a toast" /
#          "and it reads \"Folder name taken\", the frame's shape of words" / "and it sits bottom-left, where frame `08:55` stacks them"
#   or "the sidebar path reports the refusal with the same words"
#   (the sidebar opens this form since `commit-log/log-a0b4108-1`, so its
#   refusal is this onError's too)
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "    onError: (e) => toast.error(e instanceof Error ? e.message : t('quickCreate.folderFailed')),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ""))
print('quick-create-modal.tsx: the Folder tab has no onError again — a refused create is indistinguishable from a hang.')
