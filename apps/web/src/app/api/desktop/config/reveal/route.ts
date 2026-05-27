import { isSecretDesktopApiField } from "@/desktop/config/catalog";
import { isDesktopMode, readDesktopApiConfig } from "@/desktop/config/server";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
	key: z.string(),
});

function disabledResponse() {
	return NextResponse.json(
		{
			error:
				"desktop_config_disabled: start Shotlyx with SHOTLYX_DESKTOP=1 to reveal local API values",
		},
		{ status: 404 },
	);
}

export async function POST(request: NextRequest) {
	if (!isDesktopMode()) return disabledResponse();

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	if (!isSecretDesktopApiField(parsed.data.key)) {
		return NextResponse.json(
			{ error: "Not a secret desktop API field" },
			{ status: 400 },
		);
	}

	const value = readDesktopApiConfig().values[parsed.data.key] ?? "";
	return NextResponse.json({
		desktop: true,
		key: parsed.data.key,
		configured: Boolean(value),
		value,
	});
}
