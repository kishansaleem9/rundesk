# THE ACCOUNT'S ROLE REFUSES A TIMER AGAIN, as the retired guard did: an account marked guest is refused whatever its workspace makes it.
# Reddens: time-tracking-readers: "an account marked guest on its own, and a member of the workspace, is what the workspace makes it: it tracks time and asks the knowledge base"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/time-entries.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("import { Controller, Get, Post, Param, Body, UseGuards, BadRequestException } from '@nestjs/common'\n",
     "import { Controller, Get, Post, Param, Body, UseGuards, BadRequestException, ForbiddenException } from '@nestjs/common'\n"),
    ("    return this.tasks.startTimer(taskId, user.id, body?.description, body?.isBillable)\n",
     "    if (user.role === 'guest') throw new ForbiddenException('Guests cannot use this feature')\n    return this.tasks.startTimer(taskId, user.id, body?.description, body?.isBillable)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ttr-2-account-role-refuses-timers: the account's role refuses a timer")
