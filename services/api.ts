/**
 * api.ts — Shared API helper for all frontend components
 * 
 * Provides secureGet/securePost that call the Python FastAPI backend
 * with JWT auth from localStorage.
 */

const API_BASE = "http://localhost:8000/api";

const getToken = (): string | null => localStorage.getItem("algoTradePro_jwt");

/**
 * Handle 401 Unauthorized — clear stored JWT and dispatch logout event.
 * This stops all polling components (they unmount on logout redirect).
 */
function handle401(): never {
    localStorage.removeItem("algoTradePro_jwt");
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expired. Please log in again.");
}

// Legacy export — some components import { api } for direct use
export const api = {
    get: (path: string) => secureGet(path),
    post: (path: string, body?: any) => securePost(path, body),
    put: (path: string, body?: any) => securePut(path, body),
    delete: (path: string) => secureDelete(path),
};

export async function secureGet(path: string): Promise<any> {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (res.status === 401) handle401();

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.message || `API error ${res.status}`);
    }

    const json = await res.json();
    return json.data ?? json;
}

export async function securePost(path: string, body?: any): Promise<any> {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) handle401();

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `API error ${res.status}`);
    }

    const json = await res.json();
    return json.data ?? json;
}

export async function secureDelete(path: string): Promise<any> {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (res.status === 401) handle401();

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `API error ${res.status}`);
    }

    const json = await res.json();
    return json.data ?? json;
}

export async function securePut(path: string, body?: any): Promise<any> {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) handle401();

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || `API error ${res.status}`);
    }

    const json = await res.json();
    return json.data ?? json;
}
