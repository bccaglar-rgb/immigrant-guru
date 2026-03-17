import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ["react", "react-dom", "react-router-dom"],
                    ui: ["recharts", "lightweight-charts", "lucide-react"],
                },
            },
        },
    },
    server: {
        allowedHosts: true,
        proxy: {
            "/api": "http://localhost:8090",
            "/ws": {
                target: "ws://localhost:8090",
                ws: true,
            },
        },
    },
});
