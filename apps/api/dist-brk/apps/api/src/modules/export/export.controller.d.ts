import { ExportService } from './export.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
export declare class ExportController {
    private readonly svc;
    private readonly workspaces;
    constructor(svc: ExportService, workspaces: WorkspacesService);
    exportJson(workspaceId: string, user: any, ip: string, res: any): Promise<void>;
    exportTasksCsv(workspaceId: string, user: any, ip: string, res: any): Promise<void>;
    exportMembersCsv(workspaceId: string, user: any, ip: string, res: any): Promise<void>;
}
