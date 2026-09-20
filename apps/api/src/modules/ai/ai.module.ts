import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { BriefingService } from './briefing.service'
import { WorkloadAlertService } from './workload-alert.service'
import { EmbeddingService } from './embedding.service'
import { KnowledgeIndexerService } from './knowledge-indexer.service'
import { AiController } from './ai.controller'
import { ChatThreadsService } from './chat-threads.service'
import { ChatThreadsController } from './chat-threads.controller'
import { KnowledgeController } from './knowledge.controller'
import { TasksModule } from '../tasks/tasks.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlansModule } from '../plans/plans.module'
import { SearchModule } from '../search/search.module'
import { SkillsModule } from '../skills/skills.module'
import { DocsModule } from '../docs/docs.module'
import { ListsModule } from '../lists/lists.module'
import { FoldersModule } from '../folders/folders.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // NotificationsModule supplies NotificationsService for briefing + workload
  // alert delivery (§7.11/§7.12). AiModule already depends on it transitively via
  // TasksModule and Notifications imports neither Ai nor Tasks, so no cycle.
  // PlansModule supplies PlanFeatureGuard + PlansService for the §14.1 AI gate.
  // SearchModule is @Global and supplies SearchService to the surfaces that
  // use it; AiService itself no longer injects it (§V2-S16 removed a retained-
  // for-nothing injection), and it stays imported because KnowledgeController
  // and the indexer in this module still reach search-shaped helpers.
  // SkillsModule supplies SkillsService so a chat turn can be answered *as* a
  // skill (§15) — the service also owns the visibility and enabled checks, so
  // resolving the skill through it is what stops a caller invoking one they
  // cannot see. Skills imports nothing from Ai, so no cycle.
  //
  // §V2-S16 `[17:44]`–`[18:48]` — Lists / Folders / CustomRoles are what let
  // the AI bring a container into existence. They are imported rather than
  // re-implemented so a list the AI makes is the same row, with the same status
  // pipeline and the same permission rules, as one a person makes. None of the
  // three imports AiModule, so there is no cycle.
  imports: [
    TasksModule,
    NotificationsModule,
    PlansModule,
    SearchModule,
    SkillsModule,
    DocsModule,
    ListsModule,
    FoldersModule,
    CustomRolesModule,
  ],
  controllers: [AiController, KnowledgeController, ChatThreadsController],
  // BriefingService owns the hourly @Cron that delivers daily briefings;
  // WorkloadAlertService owns the daily @Cron that alerts managers about
  // overloaded teammates (§7.12) — both must be provided here or their crons
  // never register. KnowledgeIndexerService owns the nightly @Cron that
  // re-embeds each workspace into the §15.1 semantic store; EmbeddingService is
  // the pluggable embedder (env-gated real API + deterministic local default)
  // used by both the indexer and AiService's knowledge retrieval.
  providers: [AiService, BriefingService, WorkloadAlertService, EmbeddingService, KnowledgeIndexerService, ChatThreadsService],
  exports: [AiService],
})
export class AiModule {}
