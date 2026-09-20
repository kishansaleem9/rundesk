/**
 * §12.2 — hosts the background @Cron that keeps task↔external links in sync
 * (Drive/Dropbox names, GitHub/GitLab PR & issue state). The service must be
 * provided here (and the module imported in AppModule) for its cron to register
 * with the already-configured ScheduleModule.
 */
export declare class ExternalLinkSyncModule {
}
