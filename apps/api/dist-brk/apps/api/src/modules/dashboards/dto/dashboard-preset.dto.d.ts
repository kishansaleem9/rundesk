export declare class CreateDashboardPresetDto {
    workspaceId: string;
    name: string;
    layout: any[];
    isDefault?: boolean;
}
export declare class UpdateDashboardPresetDto {
    name?: string;
    layout?: any[];
    isDefault?: boolean;
}
