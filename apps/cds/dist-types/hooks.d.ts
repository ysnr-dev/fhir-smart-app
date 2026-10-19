/**
 * CDS Hooks 2.0 の電文のうち、このサービスが使う部分の型。
 */
export interface DiscoveryService {
    hook: string;
    id: string;
    title: string;
    description: string;
    prefetch?: Record<string, string>;
}
export interface FhirAuthorization {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    subject: string;
    patient?: string;
}
export interface HookRequest {
    hookInstance: string;
    hook: string;
    fhirServer?: string;
    fhirAuthorization?: FhirAuthorization;
    context: {
        userId?: string;
        patientId?: string;
        encounterId?: string;
    };
    prefetch?: Record<string, fhir4.Resource | null>;
}
export interface Coding {
    code: string;
    system?: string;
    display?: string;
}
export interface Link {
    label: string;
    url: string;
    type: "absolute" | "smart";
    appContext?: string;
}
export interface Card {
    uuid: string;
    summary: string;
    detail?: string;
    indicator: "info" | "warning" | "critical";
    source: {
        label: string;
        url?: string;
        topic?: Coding;
    };
    links?: Link[];
    overrideReasons?: Coding[];
}
export interface FeedbackRequest {
    feedback: {
        card: string;
        outcome: "accepted" | "overridden";
        outcomeTimestamp?: string;
        overrideReason?: {
            reason?: Coding;
            userComment?: string;
        };
    }[];
}
//# sourceMappingURL=hooks.d.ts.map