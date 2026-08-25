import { Module } from '@nestjs/common'
import { SkillsService } from './skills.service'
import { SkillsController } from './skills.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [SkillsService, WorkspaceMemberGuard],
  controllers: [SkillsController],
  // Exported so the AI module can fold a skill's playbook and memory into a
  // chat's system prompt (§15) without reaching into the tables itself.
  exports: [SkillsService],
})
export class SkillsModule {}
