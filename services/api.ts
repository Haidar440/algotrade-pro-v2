/**
 * api.ts — Shared API helper for all frontend components
 *
 * Provides secureGet/securePost that call the Python FastAPI backend
 * with JWT auth from localStorage.
 *
 * All requests have a 8-second AbortController timeout so UI never
 * spins forever when the backend or Angel One API is slow.
 */

const API_BASE = "http://localhost:8000/api";
export const DEFAULT_TIMEOUT_MS = 8000;   // 8s for all normal requests
export const SCAN_TIMEOUT_MS    = 45000;  // 45s for heavy scan/analysis endpoints

export class ApiError extends Error {
    status: number;
    code?: string;
    retryAfterSeconds?: number;

    constructor(message: string, status: number, code?: string, retryAfterSeconds?: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

const getToken = (): string | null => localStorage.getItem("algoTradePro_jwt");

const isAuthPath = (path: string): boolean => {
    const normalized = path.toLowerCase();
    return normalized.startsWith("/auth/login") || normalized.startsWith("/auth/register") || normalized.startsWith("/auth/token");
};

const shouldAutoLogoutOn401 = (path: string, token: string | null): boolean => {
    if (isAuthPath(path)) return false;
    if (!token) return false;
    return true;
};

/**
 * Handle 401 Unauthorized — clear stored JWT and dispatch logout event.
 */
function handle401(): never {
    localStorage.removeItem("algoTradePro_jwt");
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expired. Please log in again.");
}

/**
 * Creates a fetch call wrapped with an AbortController timeout.
 * If the request takes longer than FETCH_TIMEOUT_MS, it auto-aborts
 * and throws a user-friendly timeout error.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new ApiError('Request timed out. The server is taking too long to respond.', 408);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

// Legacy export — some components import { api } for direct use
export const api = {
    get: (path: string) => secureGet(path),
    post: (path: string, body?: any) => securePost(path, body),
    put: (path: string, body?: any) => securePut(path, body),
    delete: (path: string) => secureDelete(path),
};

export async function secureGet(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
    const token = getToken();
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    }, timeoutMs);

    if (res.status === 401 && shouldAutoLogoutOn401(path, token)) handle401();

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const retryAfter = Number(res.headers.get("Retry-After") || "0");
        throw new ApiError(
            body.detail || body.message || body.error || `API error ${res.status}`,
            res.status,
            body.error_code,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
        );
    }

    const json = await res.json();
    return json.data ?? json;
}

export async function securePost(path: string, body?: any, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
    const token = getToken();
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    }, timeoutMs);

    if (res.status === 401 && shouldAutoLogoutOn401(path, token)) handle401();

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = Number(res.headers.get("Retry-After") || "0");
        throw new ApiError(
            data.detail || data.message || data.error || `API error ${res.status}`,
            res.status,
            data.error_code,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
        );
    }

    const json = await res.json();
    return json.data ?? json;
}

export async function secureDelete(path: string): Promise<any> {
    const token = getToken();
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (res.status === 401 && shouldAutoLogoutOn401(path, token)) handle401();

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = Number(res.headers.get("Retry-After") || "0");
        throw new ApiError(
            data.detail || data.message || data.error || `API error ${res.status}`,
            res.status,
            data.error_code,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
        );
    }

    const json = await res.json();
    return json.data ?? json;
}

export async function securePut(path: string, body?: any): Promise<any> {
    const token = getToken();
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && shouldAutoLogoutOn401(path, token)) handle401();

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = Number(res.headers.get("Retry-After") || "0");
        throw new ApiError(
            data.detail || data.message || data.error || `API error ${res.status}`,
            res.status,
            data.error_code,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
        );
    }

    const json = await res.json();
    return json.data ?? json;
}
