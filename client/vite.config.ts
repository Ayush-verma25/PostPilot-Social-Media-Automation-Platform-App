import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_");

    if (process.env.NODE_ENV === "production" && !env.VITE_API_BASE_URL?.trim()) {
        throw new Error("VITE_API_BASE_URL must be configured for production builds");
    }

    return {
        plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    };
});
