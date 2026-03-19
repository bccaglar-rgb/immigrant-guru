/**
 * Address deriver — now delegates to AddressPoolService.
 *
 * This function is kept for backward compatibility with paymentService.createInvoice().
 * In the new flow, addresses come from the pre-generated pool via AddressPoolService.
 * This fallback returns the fixed deposit address if pool is not yet initialized.
 */

const FIXED_ADDRESS = process.env.TRON_DEPOSIT_ADDRESS ?? "";

export const deriveInvoiceAddress = (_xpub: string, _invoiceId: string, _addressIndex: number): string => {
  // Fallback to fixed address if pool service is not used
  if (!FIXED_ADDRESS || !FIXED_ADDRESS.startsWith("T")) {
    throw new Error("TRON_DEPOSIT_ADDRESS env var not configured or invalid");
  }
  return FIXED_ADDRESS;
};
