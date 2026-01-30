import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import { getInvoiceTemplate } from "@/lib/helpers";
import { ENV, TAILWIND_CDN } from "@/lib/variables";
import { InvoiceType } from "@/types";

// ZUGFeRD profile types
export type ZugferdProfile = "BASIC" | "EN16931" | "EXTENDED";

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
    const code = currency.split(" ")[0].toUpperCase();
    return code.length === 3 ? code : "EUR";
}

/**
 * Formats date string to Date object
 */
function parseDate(dateString: string): Date {
    return new Date(dateString);
}

/**
 * Convert Invoify invoice data to node-zugferd BASIC profile format
 */
function mapToZugferdBasic(invoice: InvoiceType) {
    const currencyCode = getCurrencyCode(invoice.details.currency);
    const taxRate = invoice.details.taxDetails?.amountType === "percentage"
        ? invoice.details.taxDetails.amount
        : 0;
    const taxAmount = invoice.details.taxDetails?.amountType === "percentage"
        ? (invoice.details.subTotal * (invoice.details.taxDetails?.amount || 0)) / 100
        : (invoice.details.taxDetails?.amount || 0);

    return {
        number: invoice.details.invoiceNumber,
        typeCode: "380" as const, // Commercial invoice
        issueDate: parseDate(invoice.details.invoiceDate),
        transaction: {
            tradeAgreement: {
                buyerReference: invoice.receiver.buyerReference || undefined,
                seller: {
                    name: invoice.sender.name,
                    postalAddress: {
                        countryCode: getCountryCode(invoice.sender.country) as "DE",
                        postcode: invoice.sender.zipCode,
                        line1: invoice.sender.address,
                        city: invoice.sender.city,
                    },
                    taxRegistration: invoice.sender.vatId ? {
                        vatIdentifier: invoice.sender.vatId,
                    } : undefined,
                    contact: {
                        email: invoice.sender.email,
                        phone: invoice.sender.phone,
                    },
                },
                buyer: {
                    name: invoice.receiver.name,
                    postalAddress: {
                        countryCode: getCountryCode(invoice.receiver.country) as "DE",
                        postcode: invoice.receiver.zipCode,
                        line1: invoice.receiver.address,
                        city: invoice.receiver.city,
                    },
                    taxRegistration: invoice.receiver.vatId ? {
                        vatIdentifier: invoice.receiver.vatId,
                    } : undefined,
                    contact: {
                        email: invoice.receiver.email,
                        phone: invoice.receiver.phone,
                    },
                },
            },
            tradeDelivery: {
                event: {
                    date: parseDate(invoice.details.invoiceDate),
                },
            },
            tradeSettlement: {
                currency: currencyCode as "EUR",
                paymentTerms: invoice.details.paymentTerms ? {
                    description: invoice.details.paymentTerms,
                    dueDate: parseDate(invoice.details.dueDate),
                } : undefined,
                paymentMeans: invoice.details.paymentInformation ? {
                    typeCode: "58" as const, // SEPA Credit Transfer
                    payeeAccount: {
                        iban: invoice.details.paymentInformation.iban || invoice.details.paymentInformation.accountNumber,
                        name: invoice.details.paymentInformation.accountName,
                    },
                    payeeInstitution: invoice.details.paymentInformation.bic ? {
                        bic: invoice.details.paymentInformation.bic,
                    } : undefined,
                } : undefined,
                taxSummary: [{
                    taxAmount: taxAmount,
                    basisAmount: invoice.details.subTotal,
                    categoryCode: "S" as const, // Standard rate
                    ratePercent: taxRate,
                }],
                summary: {
                    totalLineAmount: invoice.details.subTotal,
                    taxBasisTotalAmount: invoice.details.subTotal,
                    taxTotalAmount: taxAmount,
                    grandTotalAmount: invoice.details.totalAmount,
                    duePayableAmount: invoice.details.totalAmount,
                },
            },
            lineItems: invoice.details.items.map((item, index) => ({
                lineId: (index + 1).toString(),
                tradeProduct: {
                    name: item.name,
                    description: item.description || undefined,
                },
                tradeAgreement: {
                    netPrice: {
                        amount: item.unitPrice,
                    },
                },
                tradeDelivery: {
                    billedQuantity: {
                        value: item.quantity,
                        unitCode: "C62" as const, // Unit
                    },
                },
                tradeSettlement: {
                    tradeTax: {
                        categoryCode: "S" as const,
                        ratePercent: taxRate,
                    },
                    sum: {
                        totalLineAmount: item.total,
                    },
                },
            })),
        },
    };
}

/**
 * Generate PDF using Puppeteer
 */
async function generatePdfBuffer(invoice: InvoiceType): Promise<Uint8Array> {
    let browser;
    let page;

    try {
        const ReactDOMServer = (await import("react-dom/server")).default;
        const templateId = invoice.details.pdfTemplate;
        const InvoiceTemplate = await getInvoiceTemplate(templateId);
        const htmlTemplate = ReactDOMServer.renderToStaticMarkup(
            InvoiceTemplate(invoice)
        );

        if (ENV === "production") {
            const puppeteer = (await import("puppeteer-core")).default;
            browser = await puppeteer.launch({
                args: [...chromium.args, "--disable-dev-shm-usage", "--ignore-certificate-errors"],
                executablePath: await chromium.executablePath(),
                headless: true,
            });
        } else {
            const puppeteer = (await import("puppeteer")).default;
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                headless: true,
            });
        }

        if (!browser) {
            throw new Error("Failed to launch browser");
        }

        page = await browser.newPage();
        await page.setContent(await htmlTemplate, {
            waitUntil: ["networkidle0", "load", "domcontentloaded"],
            timeout: 30000,
        });

        await page.addStyleTag({
            url: TAILWIND_CDN,
        });

        const pdf: Uint8Array = await page.pdf({
            format: "a4",
            printBackground: true,
            preferCSSPageSize: true,
        });

        return pdf;
    } finally {
        if (page) {
            try {
                await page.close();
            } catch (e) {
                console.error("Error closing page:", e);
            }
        }
        if (browser) {
            try {
                const pages = await browser.pages();
                await Promise.all(pages.map((p) => p.close()));
                await browser.close();
            } catch (e) {
                console.error("Error closing browser:", e);
            }
        }
    }
}

/**
 * Generate ZUGFeRD PDF with embedded XML
 *
 * @param {InvoiceType} invoice - The invoice data
 * @param {ZugferdProfile} profile - The ZUGFeRD profile to use
 * @returns {Promise<NextResponse>} A response containing the ZUGFeRD PDF
 */
export async function generateZugferdPdf(
    invoice: InvoiceType,
    profile: ZugferdProfile = "BASIC"
): Promise<NextResponse> {
    try {
        // Dynamically import node-zugferd (ESM module)
        const { zugferd } = await import("node-zugferd");

        // Select profile based on parameter
        let selectedProfile;
        switch (profile) {
            case "EN16931":
                const { EN16931 } = await import("node-zugferd/profile/en16931");
                selectedProfile = EN16931;
                break;
            case "EXTENDED":
                const { EXTENDED } = await import("node-zugferd/profile/extended");
                selectedProfile = EXTENDED;
                break;
            case "BASIC":
            default:
                const { BASIC } = await import("node-zugferd/profile/basic");
                selectedProfile = BASIC;
                break;
        }

        // Create zugferd invoicer instance
        const invoicer = zugferd({
            profile: selectedProfile,
        });

        // Map Invoify data to ZUGFeRD format
        const zugferdData = mapToZugferdBasic(invoice);

        // Create the invoice
        // @ts-expect-error - Type complexity from node-zugferd profiles
        const zugferdInvoice = invoicer.create(zugferdData);

        // Generate the base PDF
        const pdfBuffer = await generatePdfBuffer(invoice);

        // Embed XML into PDF to create PDF/A-3b
        const zugferdPdf = await zugferdInvoice.embedInPdf(pdfBuffer, {
            metadata: {
                title: `Invoice ${invoice.details.invoiceNumber}`,
                author: invoice.sender.name,
                subject: `Invoice for ${invoice.receiver.name}`,
                creator: "Invoify",
            },
        });

        return new NextResponse(new Blob([zugferdPdf], { type: "application/pdf" }), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename=zugferd-${invoice.details.invoiceNumber || "invoice"}.pdf`,
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
            },
            status: 200,
        });
    } catch (error: any) {
        console.error("ZUGFeRD PDF Generation Error:", error);
        return new NextResponse(
            JSON.stringify({
                error: "Failed to generate ZUGFeRD PDF",
                details: error.message
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}

/**
 * API handler for ZUGFeRD PDF generation
 */
export async function generateZugferdService(req: NextRequest): Promise<NextResponse> {
    try {
        const body: InvoiceType = await req.json();
        const profile = (req.nextUrl.searchParams.get("profile") as ZugferdProfile) || "BASIC";

        return await generateZugferdPdf(body, profile);
    } catch (error: any) {
        console.error("ZUGFeRD Service Error:", error);
        return new NextResponse(
            JSON.stringify({ error: "Failed to process ZUGFeRD request" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}
