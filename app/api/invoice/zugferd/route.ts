import { NextRequest } from "next/server";

// Services
import { generateZugferdService } from "@/services/invoice/server/generateZugferdService";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const result = await generateZugferdService(req);
    return result;
}
