export declare class CreateWebhookDto {
    name: string;
    url: string;
    events: string[];
    secret?: string;
}
export declare class UpdateWebhookDto {
    name?: string;
    url?: string;
    events?: string[];
    isEnabled?: boolean;
}
