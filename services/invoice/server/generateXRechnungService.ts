import { NextResponse } from "next/server";
import { Builder } from "xml2js";
import { InvoiceType } from "@/types";

/**
 * Maps country name to ISO 3166-1 alpha-2 code
 */
function getCountryCode(country: string): string {
    const countryMap: Record<string, string> = {
        "Germany": "DE",
        "Deutschland": "DE",
        "Austria": "AT",
        "Österreich": "AT",
        "Switzerland": "CH",
        "Schweiz": "CH",
        "France": "FR",
        "Frankreich": "FR",
        "Italy": "IT",
        "Italien": "IT",
        "Netherlands": "NL",
        "Niederlande": "NL",
        "Belgium": "BE",
        "Belgien": "BE",
        "United Kingdom": "GB",
        "United States": "US",
    };
    return countryMap[country] || country.substring(0, 2).toUpperCase();
}

/**
 * Maps currency code to proper format
 */
function getCurrencyCode(currency: string): string {
    // Extract currency code from format like "EUR - Euro" or just "EUR"
    const code = currency.split(" ")[0].toUpperCase();
    return code.length === 3 ? code : "EUR";
}

/**
 * Formats date to ISO format (YYYY-MM-DD)
 */
function formatDateISO(dateString: string): string {
    const date = new Date(dateString);
    return date.toISOString().split("T")[0];
}

/**
 * Generates a unique invoice ID if not provided
 */
function generateInvoiceId(invoiceNumber: string): string {
    return invoiceNumber || `INV-${Date.now()}`;
}

/**
 * Convert Invoify invoice data to XRechnung UBL 2.1 XML format
 * Compliant with EN 16931 / XRechnung 3.0
 */
function convertToXRechnungUBL(invoice: InvoiceType): object {
    const currencyCode = getCurrencyCode(invoice.details.currency);
    const taxAmount = invoice.details.taxDetails?.amount || 0;
    const taxRate = invoice.details.taxDetails?.amountType === "percentage"
        ? invoice.details.taxDetails.amount
        : 0;

    // Calculate tax amount if percentage
    const calculatedTaxAmount = invoice.details.taxDetails?.amountType === "percentage"
        ? (invoice.details.subTotal * taxAmount) / 100
        : taxAmount;

    const ublInvoice = {
        "ubl:Invoice": {
            $: {
                "xmlns:ubl": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
                "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
                "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
            },
            // BT-24: Specification identifier
            "cbc:CustomizationID": "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
            // BT-23: Business process type
            "cbc:ProfileID": "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
            // BT-1: Invoice number
            "cbc:ID": generateInvoiceId(invoice.details.invoiceNumber),
            // BT-2: Invoice issue date
            "cbc:IssueDate": formatDateISO(invoice.details.invoiceDate),
            // BT-9: Payment due date
            "cbc:DueDate": formatDateISO(invoice.details.dueDate),
            // BT-3: Invoice type code (380 = Commercial invoice)
            "cbc:InvoiceTypeCode": "380",
            // BT-22: Notes
            "cbc:Note": invoice.details.additionalNotes || "",
            // BT-5: Invoice currency code
            "cbc:DocumentCurrencyCode": currencyCode,
            // BT-10: Buyer reference (Leitweg-ID for German public sector)
            "cbc:BuyerReference": invoice.receiver.buyerReference || "N/A",

            // BG-4: Seller
            "cac:AccountingSupplierParty": {
                "cac:Party": {
                    // BT-29: Seller identifier
                    "cac:PartyIdentification": {
                        "cbc:ID": invoice.sender.vatId || "",
                    },
                    // BT-27: Seller name
                    "cac:PartyName": {
                        "cbc:Name": invoice.sender.name,
                    },
                    // BG-5: Seller postal address
                    "cac:PostalAddress": {
                        "cbc:StreetName": invoice.sender.address,
                        "cbc:CityName": invoice.sender.city,
                        "cbc:PostalZone": invoice.sender.zipCode,
                        "cac:Country": {
                            "cbc:IdentificationCode": getCountryCode(invoice.sender.country),
                        },
                    },
                    // BT-31: Seller VAT identifier
                    "cac:PartyTaxScheme": {
                        "cbc:CompanyID": invoice.sender.vatId || "",
                        "cac:TaxScheme": {
                            "cbc:ID": "VAT",
                        },
                    },
                    // BG-6: Seller contact
                    "cac:Contact": {
                        "cbc:Telephone": invoice.sender.phone,
                        "cbc:ElectronicMail": invoice.sender.email,
                    },
                },
            },

            // BG-7: Buyer
            "cac:AccountingCustomerParty": {
                "cac:Party": {
                    // BT-46: Buyer identifier
                    "cac:PartyIdentification": {
                        "cbc:ID": invoice.receiver.vatId || "",
                    },
                    // BT-44: Buyer name
                    "cac:PartyName": {
                        "cbc:Name": invoice.receiver.name,
                    },
                    // BG-8: Buyer postal address
                    "cac:PostalAddress": {
                        "cbc:StreetName": invoice.receiver.address,
                        "cbc:CityName": invoice.receiver.city,
                        "cbc:PostalZone": invoice.receiver.zipCode,
                        "cac:Country": {
                            "cbc:IdentificationCode": getCountryCode(invoice.receiver.country),
                        },
                    },
                    // BT-48: Buyer VAT identifier
                    "cac:PartyTaxScheme": invoice.receiver.vatId ? {
                        "cbc:CompanyID": invoice.receiver.vatId,
                        "cac:TaxScheme": {
                            "cbc:ID": "VAT",
                        },
                    } : undefined,
                    // BG-9: Buyer contact
                    "cac:Contact": {
                        "cbc:Telephone": invoice.receiver.phone,
                        "cbc:ElectronicMail": invoice.receiver.email,
                    },
                },
            },

            // BG-16: Payment means
            "cac:PaymentMeans": {
                // BT-81: Payment means type code (58 = SEPA credit transfer)
                "cbc:PaymentMeansCode": "58",
                // BT-83: Payment ID
                "cbc:PaymentID": invoice.details.invoiceNumber,
                // BG-17: Credit transfer
                "cac:PayeeFinancialAccount": invoice.details.paymentInformation ? {
                    // BT-84: IBAN
                    "cbc:ID": invoice.details.paymentInformation.iban || invoice.details.paymentInformation.accountNumber,
                    // BT-85: Account name
                    "cbc:Name": invoice.details.paymentInformation.accountName,
                    // BT-86: BIC
                    "cac:FinancialInstitutionBranch": invoice.details.paymentInformation.bic ? {
                        "cbc:ID": invoice.details.paymentInformation.bic,
                    } : undefined,
                } : undefined,
            },

            // BT-20: Payment terms
            "cac:PaymentTerms": {
                "cbc:Note": invoice.details.paymentTerms,
            },

            // BG-23: VAT breakdown
            "cac:TaxTotal": {
                // BT-110: Invoice total VAT amount
                "cbc:TaxAmount": {
                    $: { currencyID: currencyCode },
                    _: calculatedTaxAmount.toFixed(2),
                },
                // BG-23: VAT breakdown
                "cac:TaxSubtotal": {
                    // BT-116: Taxable amount
                    "cbc:TaxableAmount": {
                        $: { currencyID: currencyCode },
                        _: invoice.details.subTotal.toFixed(2),
                    },
                    // BT-117: Tax amount
                    "cbc:TaxAmount": {
                        $: { currencyID: currencyCode },
                        _: calculatedTaxAmount.toFixed(2),
                    },
                    "cac:TaxCategory": {
                        // BT-118: VAT category code
                        "cbc:ID": "S", // Standard rate
                        // BT-119: VAT rate
                        "cbc:Percent": taxRate.toString(),
                        "cac:TaxScheme": {
                            "cbc:ID": "VAT",
                        },
                    },
                },
            },

            // BG-22: Document totals
            "cac:LegalMonetaryTotal": {
                // BT-106: Sum of Invoice line net amount
                "cbc:LineExtensionAmount": {
                    $: { currencyID: currencyCode },
                    _: invoice.details.subTotal.toFixed(2),
                },
                // BT-109: Invoice total without VAT
                "cbc:TaxExclusiveAmount": {
                    $: { currencyID: currencyCode },
                    _: invoice.details.subTotal.toFixed(2),
                },
                // BT-112: Invoice total with VAT
                "cbc:TaxInclusiveAmount": {
                    $: { currencyID: currencyCode },
                    _: invoice.details.totalAmount.toFixed(2),
                },
                // BT-115: Amount due for payment
                "cbc:PayableAmount": {
                    $: { currencyID: currencyCode },
                    _: invoice.details.totalAmount.toFixed(2),
                },
            },

            // BG-25: Invoice lines
            "cac:InvoiceLine": invoice.details.items.map((item, index) => ({
                // BT-126: Invoice line identifier
                "cbc:ID": (index + 1).toString(),
                // BT-129: Invoiced quantity
                "cbc:InvoicedQuantity": {
                    $: { unitCode: "C62" }, // C62 = Unit
                    _: item.quantity.toString(),
                },
                // BT-131: Invoice line net amount
                "cbc:LineExtensionAmount": {
                    $: { currencyID: currencyCode },
                    _: item.total.toFixed(2),
                },
                // BG-30: Line VAT information
                "cac:Item": {
                    // BT-154: Item description
                    "cbc:Description": item.description || item.name,
                    // BT-153: Item name
                    "cbc:Name": item.name,
                    // BG-30: Line VAT information
                    "cac:ClassifiedTaxCategory": {
                        "cbc:ID": "S", // Standard rate
                        "cbc:Percent": taxRate.toString(),
                        "cac:TaxScheme": {
                            "cbc:ID": "VAT",
                        },
                    },
                },
                // BG-29: Price details
                "cac:Price": {
                    // BT-146: Item net price
                    "cbc:PriceAmount": {
                        $: { currencyID: currencyCode },
                        _: item.unitPrice.toFixed(2),
                    },
                },
            })),
        },
    };

    return ublInvoice;
}

/**
 * Generate XRechnung XML string from invoice data
 *
 * @param {InvoiceType} invoice - The invoice data
 * @returns {string} The XRechnung XML string
 */
export function generateXRechnungXML(invoice: InvoiceType): string {
    const ublData = convertToXRechnungUBL(invoice);

    const builder = new Builder({
        xmldec: { version: "1.0", encoding: "UTF-8" },
        renderOpts: { pretty: true, indent: "  ", newline: "\n" },
    });

    return builder.buildObject(ublData);
}

/**
 * Generate XRechnung XML response from invoice data
 *
 * @param {InvoiceType} invoice - The invoice data
 * @returns {NextResponse} A response containing the XRechnung XML
 */
export function generateXRechnungResponse(invoice: InvoiceType): NextResponse {
    try {
        const xml = generateXRechnungXML(invoice);

        return new NextResponse(xml, {
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Content-Disposition": `attachment; filename=xrechnung-${invoice.details.invoiceNumber || "invoice"}.xml`,
            },
            status: 200,
        });
    } catch (error) {
        console.error("XRechnung generation error:", error);
        return new NextResponse(
            JSON.stringify({ error: "Failed to generate XRechnung" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}
