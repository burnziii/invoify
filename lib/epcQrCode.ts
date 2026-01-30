import QRCode from "qrcode";

/**
 * EPC-QR-Code (GiroCode) Generator
 * Generates QR codes for SEPA Credit Transfer according to EPC069-12 standard
 *
 * Supported in: Germany, Austria, Belgium, Finland, Netherlands
 */

export interface EpcQrCodeData {
    /** Beneficiary name (max 70 characters) */
    name: string;
    /** IBAN (max 34 characters) */
    iban: string;
    /** BIC/SWIFT code (8 or 11 characters, optional for German IBANs) */
    bic?: string;
    /** Amount in EUR (max 999999999.99) */
    amount: number;
    /** Payment reference / purpose (max 140 characters) */
    reference?: string;
    /** Remittance information / message (max 140 characters) */
    message?: string;
}

export interface EpcQrCodeOptions {
    /** QR code size in pixels (default: 200) */
    size?: number;
    /** Error correction level (default: 'M') */
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    /** Output format */
    format?: "base64" | "dataUrl" | "svg";
}

/**
 * Validates IBAN format (basic validation)
 */
function validateIban(iban: string): boolean {
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(cleanIban);
}

/**
 * Validates BIC format
 */
function validateBic(bic: string): boolean {
    if (!bic) return true; // BIC is optional
    const cleanBic = bic.replace(/\s/g, "").toUpperCase();
    return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanBic);
}

/**
 * Formats amount according to EPC standard (EUR followed by amount with dot as decimal separator)
 */
function formatAmount(amount: number): string {
    if (amount <= 0 || amount > 999999999.99) {
        return "";
    }
    return `EUR${amount.toFixed(2)}`;
}

/**
 * Truncates string to maximum length
 */
function truncate(str: string, maxLength: number): string {
    if (!str) return "";
    return str.substring(0, maxLength);
}

/**
 * Generates EPC-QR-Code data string according to EPC069-12 V2.1 standard
 *
 * Format:
 * Line 1: Service Tag (BCD)
 * Line 2: Version (002)
 * Line 3: Character set (1 = UTF-8)
 * Line 4: Identification (SCT = SEPA Credit Transfer)
 * Line 5: BIC of beneficiary bank
 * Line 6: Name of beneficiary
 * Line 7: IBAN of beneficiary
 * Line 8: Amount (EUR followed by amount)
 * Line 9: Purpose code (optional, usually empty)
 * Line 10: Remittance reference (Structured)
 * Line 11: Remittance information (Unstructured)
 * Line 12: Beneficiary to originator information (optional)
 */
export function generateEpcString(data: EpcQrCodeData): string {
    // Validate required fields
    if (!data.name || !data.iban) {
        throw new Error("Name and IBAN are required for EPC-QR-Code");
    }

    if (!validateIban(data.iban)) {
        throw new Error("Invalid IBAN format");
    }

    if (data.bic && !validateBic(data.bic)) {
        throw new Error("Invalid BIC format");
    }

    // Clean and format data
    const cleanIban = data.iban.replace(/\s/g, "").toUpperCase();
    const cleanBic = data.bic ? data.bic.replace(/\s/g, "").toUpperCase() : "";
    const name = truncate(data.name, 70);
    const amount = data.amount > 0 ? formatAmount(data.amount) : "";
    const reference = truncate(data.reference || "", 140);
    const message = truncate(data.message || "", 140);

    // Build EPC string (each field on new line)
    const lines = [
        "BCD",                    // Service Tag
        "002",                    // Version
        "1",                      // Character set (UTF-8)
        "SCT",                    // SEPA Credit Transfer
        cleanBic,                 // BIC (can be empty)
        name,                     // Beneficiary name
        cleanIban,                // IBAN
        amount,                   // Amount
        "",                       // Purpose code (empty)
        reference,                // Structured reference
        message,                  // Unstructured message
    ];

    return lines.join("\n");
}

/**
 * Generates EPC-QR-Code as Base64 PNG image
 */
export async function generateEpcQrCodeBase64(
    data: EpcQrCodeData,
    options: EpcQrCodeOptions = {}
): Promise<string> {
    const { size = 200, errorCorrectionLevel = "M" } = options;

    const epcString = generateEpcString(data);

    const qrCodeDataUrl = await QRCode.toDataURL(epcString, {
        width: size,
        margin: 1,
        errorCorrectionLevel,
        type: "image/png",
    });

    return qrCodeDataUrl;
}

/**
 * Generates EPC-QR-Code as SVG string
 */
export async function generateEpcQrCodeSvg(
    data: EpcQrCodeData,
    options: EpcQrCodeOptions = {}
): Promise<string> {
    const { size = 200, errorCorrectionLevel = "M" } = options;

    const epcString = generateEpcString(data);

    const svgString = await QRCode.toString(epcString, {
        type: "svg",
        width: size,
        margin: 1,
        errorCorrectionLevel,
    });

    return svgString;
}

/**
 * Generates EPC-QR-Code in specified format
 */
export async function generateEpcQrCode(
    data: EpcQrCodeData,
    options: EpcQrCodeOptions = {}
): Promise<string> {
    const { format = "dataUrl" } = options;

    switch (format) {
        case "svg":
            return generateEpcQrCodeSvg(data, options);
        case "base64":
            const dataUrl = await generateEpcQrCodeBase64(data, options);
            // Remove data URL prefix to get pure base64
            return dataUrl.replace(/^data:image\/png;base64,/, "");
        case "dataUrl":
        default:
            return generateEpcQrCodeBase64(data, options);
    }
}

/**
 * Checks if EPC-QR-Code can be generated for given invoice data
 * Returns true if IBAN is available and currency is EUR
 */
export function canGenerateEpcQrCode(
    iban?: string,
    currency?: string
): boolean {
    if (!iban) return false;

    // EPC-QR-Code only supports EUR
    const currencyCode = currency?.split(" ")[0]?.toUpperCase() || "";
    if (currencyCode && currencyCode !== "EUR") return false;

    return validateIban(iban);
}

/**
 * Helper to extract currency code from invoice currency string
 */
export function getCurrencyCode(currency: string): string {
    const code = currency.split(" ")[0].toUpperCase();
    return code.length === 3 ? code : "EUR";
}
