/* eslint-disable shotlyx/prefer-object-params -- These wrappers intentionally mirror native Fetch constructor signatures. */
export class ApiRequest extends Request {
	requestUrl: URL;

	constructor(input: RequestInfo | URL, init?: RequestInit) {
		super(input, init);
		this.requestUrl = new URL(this.url);
	}
}

export class ApiResponse extends Response {
	static json(body: unknown, init?: ResponseInit): Response {
		return Response.json(body, init);
	}
}
