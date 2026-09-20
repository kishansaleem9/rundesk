import { SampleDataService } from './sample-data.service';
/**
 * One-shot endpoint that loads a realistic demo workspace.
 * Admin-only and idempotent-by-refusal: see SampleDataService.seed.
 */
export declare class SampleDataController {
    private readonly sampleData;
    constructor(sampleData: SampleDataService);
    seed(workspaceId: string, user: any): Promise<{
        ok: boolean;
        summary: import("./sample-data.service").SeedSummary;
    }>;
}
