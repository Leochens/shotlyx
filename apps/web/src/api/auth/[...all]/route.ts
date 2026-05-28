import { auth } from "@/auth/server";

const handleAuthRequest = (request: Request) => auth.handler(request);

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
export const PATCH = handleAuthRequest;
export const PUT = handleAuthRequest;
export const DELETE = handleAuthRequest;
