# REMOVE LOGO KEEPS THE PICTURE.
# Reddens: workspace-ownership: "beside the avatar, Upload logo: it takes a colour and a picture as they are chosen, refuses a text file and keeps the picture it had, and once the picture is removed shows the initial on the chosen colour"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '              onClick={() => saveAvatar.mutate({ logoUrl: null })}\n'
b = '              onClick={() => saveAvatar.mutate({})}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-16-remove-keeps-the-picture: applied")
