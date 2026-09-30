import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (import.meta.env.PROD && !apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL must be configured for production builds");
}

const api = axios.create({
    baseURL: apiBaseUrl || "http://localhost:5000",
})

export const AUTH_FAILURE_EVENT = "auth:unauthorized";

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
    } else {
        config.headers.delete("Authorization");
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        if (axios.isAxiosError(error)) {
            const storedToken = localStorage.getItem("token");
            const requestAuthorization = error.config?.headers.get("Authorization");
            if (
                error.response?.status === 401 &&
                storedToken &&
                requestAuthorization === `Bearer ${storedToken}` &&
                !/\/api\/auth\/(login|register)(?:[/?]|$)/.test(error.config?.url ?? "")
            ) {
                localStorage.removeItem("user");
                localStorage.removeItem("token");
                window.dispatchEvent(new Event(AUTH_FAILURE_EVENT));
            }
        }
        return Promise.reject(error);
    },
);

export default api