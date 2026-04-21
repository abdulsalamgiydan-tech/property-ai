/** Australian states and territories for forms and stamp duty lookup. */
export const AU_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"] as const;

export type AuState = (typeof AU_STATES)[number];
