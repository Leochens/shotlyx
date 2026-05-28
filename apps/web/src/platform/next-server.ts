/* eslint-disable shotlyx/prefer-object-params -- These shims intentionally mirror Next.js and Fetch constructor signatures. */
export class NextRequest extends Request {
	nextUrl: URL;

	constructor(input: RequestInfo | URL, init?: RequestInit) {
		super(input, init);
		this.nextUrl = new URL(this.url);
	}
}

export class NextResponse extends Response {
	static json(body: unknown, init?: ResponseInit): Response {
		return Response.json(body, init);
	}
}
