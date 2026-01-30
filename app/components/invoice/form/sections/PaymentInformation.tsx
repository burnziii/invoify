"use client";

// RHF
import { useFormContext, Controller } from "react-hook-form";

// Components
import { FormInput, Subheading } from "@/app/components";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

const PaymentInformation = () => {
    const { _t } = useTranslationContext();
    const { control, watch } = useFormContext();

    // Watch IBAN to determine if EPC-QR is possible
    const iban = watch("details.paymentInformation.iban");
    const currency = watch("details.currency");

    // EPC-QR only works with EUR
    const isEurCurrency = !currency || currency.toUpperCase().startsWith("EUR");
    const canShowEpcOption = iban && iban.length > 10 && isEurCurrency;

    return (
        <section>
            <Subheading>{_t("form.steps.paymentInfo.heading")}:</Subheading>
            <div className="flex flex-wrap gap-10 mt-5">
                <FormInput
                    name="details.paymentInformation.bankName"
                    label={_t("form.steps.paymentInfo.bankName")}
                    placeholder={_t("form.steps.paymentInfo.bankName")}
                    vertical
                />
                <FormInput
                    name="details.paymentInformation.accountName"
                    label={_t("form.steps.paymentInfo.accountName")}
                    placeholder={_t("form.steps.paymentInfo.accountName")}
                    vertical
                />
                <FormInput
                    name="details.paymentInformation.accountNumber"
                    label={_t("form.steps.paymentInfo.accountNumber")}
                    placeholder={_t("form.steps.paymentInfo.accountNumber")}
                    vertical
                />
                <FormInput
                    name="details.paymentInformation.iban"
                    label={_t("form.steps.paymentInfo.iban") || "IBAN"}
                    placeholder="e.g. DE89370400440532013000"
                    vertical
                />
                <FormInput
                    name="details.paymentInformation.bic"
                    label={_t("form.steps.paymentInfo.bic") || "BIC"}
                    placeholder="e.g. COBADEFFXXX"
                    vertical
                />
            </div>

            {/* EPC-QR-Code Option */}
            <div className="mt-6 flex items-center space-x-3">
                <Controller
                    name="details.showEpcQrCode"
                    control={control}
                    render={({ field }) => (
                        <Switch
                            id="showEpcQrCode"
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            disabled={!canShowEpcOption}
                        />
                    )}
                />
                <Label
                    htmlFor="showEpcQrCode"
                    className={`text-sm ${!canShowEpcOption ? "text-gray-400" : "text-gray-700"}`}
                >
                    {_t("form.steps.paymentInfo.showEpcQrCode") || "Show EPC-QR-Code on invoice (GiroCode)"}
                </Label>
            </div>
            {!isEurCurrency && (
                <p className="mt-2 text-xs text-amber-600">
                    {_t("form.steps.paymentInfo.epcQrEurOnly") || "EPC-QR-Code is only available for EUR invoices"}
                </p>
            )}
            {isEurCurrency && !iban && (
                <p className="mt-2 text-xs text-gray-500">
                    {_t("form.steps.paymentInfo.epcQrNeedsIban") || "Enter IBAN to enable EPC-QR-Code"}
                </p>
            )}
        </section>
    );
};

export default PaymentInformation;
