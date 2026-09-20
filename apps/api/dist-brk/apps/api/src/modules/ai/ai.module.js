"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const ai_service_1 = require("./ai.service");
const briefing_service_1 = require("./briefing.service");
const workload_alert_service_1 = require("./workload-alert.service");
const embedding_service_1 = require("./embedding.service");
const knowledge_indexer_service_1 = require("./knowledge-indexer.service");
const ai_controller_1 = require("./ai.controller");
const chat_threads_service_1 = require("./chat-threads.service");
const chat_threads_controller_1 = require("./chat-threads.controller");
const knowledge_controller_1 = require("./knowledge.controller");
const tasks_module_1 = require("../tasks/tasks.module");
const notifications_module_1 = require("../notifications/notifications.module");
const plans_module_1 = require("../plans/plans.module");
const search_module_1 = require("../search/search.module");
const skills_module_1 = require("../skills/skills.module");
const docs_module_1 = require("../docs/docs.module");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        // NotificationsModule supplies NotificationsService for briefing + workload
        // alert delivery (§7.11/§7.12). AiModule already depends on it transitively via
        // TasksModule and Notifications imports neither Ai nor Tasks, so no cycle.
        // PlansModule supplies PlanFeatureGuard + PlansService for the §14.1 AI gate.
        // SearchModule supplies SearchService for §15.1 knowledge retrieval (it's
        // @Global, but importing it makes the dependency explicit).
        // SkillsModule supplies SkillsService so a chat turn can be answered *as* a
        // skill (§15) — the service also owns the visibility and enabled checks, so
        // resolving the skill through it is what stops a caller invoking one they
        // cannot see. Skills imports nothing from Ai, so no cycle.
        imports: [tasks_module_1.TasksModule, notifications_module_1.NotificationsModule, plans_module_1.PlansModule, search_module_1.SearchModule, skills_module_1.SkillsModule, docs_module_1.DocsModule],
        controllers: [ai_controller_1.AiController, knowledge_controller_1.KnowledgeController, chat_threads_controller_1.ChatThreadsController],
        // BriefingService owns the hourly @Cron that delivers daily briefings;
        // WorkloadAlertService owns the daily @Cron that alerts managers about
        // overloaded teammates (§7.12) — both must be provided here or their crons
        // never register. KnowledgeIndexerService owns the nightly @Cron that
        // re-embeds each workspace into the §15.1 semantic store; EmbeddingService is
        // the pluggable embedder (env-gated real API + deterministic local default)
        // used by both the indexer and AiService's knowledge retrieval.
        providers: [ai_service_1.AiService, briefing_service_1.BriefingService, workload_alert_service_1.WorkloadAlertService, embedding_service_1.EmbeddingService, knowledge_indexer_service_1.KnowledgeIndexerService, chat_threads_service_1.ChatThreadsService],
        exports: [ai_service_1.AiService],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map