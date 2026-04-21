export type EarlyAccessSignupPayload = {
  email: string;
  firstName?: string;
};

/**
 * Optional hook after a successful magic-link request or session creation.
 * Wire this to your waitlist or CRM without blocking auth.
 */
export async function notifyEarlyAccessInterest(
  _payload: EarlyAccessSignupPayload
): Promise<void> {
  void _payload;
  /* e.g. POST to your marketing API */
}
