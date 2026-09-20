export declare class CreateFormDto {
    title: string;
    description?: string;
    targetListId?: string;
    isPublic?: boolean;
    confirmationMsg?: string;
}
export declare class AddFormFieldDto {
    type: string;
    label: string;
    placeholder?: string;
    helpText?: string;
    isRequired?: boolean;
    position?: number;
    options?: {
        label: string;
        value: string;
    }[];
    visibilityMode?: 'all' | 'any';
    visibilityRules?: Array<{
        fieldId: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
        value: string;
    }>;
    taskField?: string;
}
export declare class SubmitFormDto {
    data?: Record<string, string | string[]>;
    submitterEmail?: string;
    submitterName?: string;
    /** A5.5 honeypot — only a bot ever fills this. See FormsService.submitForm. */
    hp?: string;
}
