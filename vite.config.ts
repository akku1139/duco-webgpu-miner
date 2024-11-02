import path from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
	compilation: {
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src")
			}
		}
	}
})
