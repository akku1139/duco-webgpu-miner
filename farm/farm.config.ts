import path from "node:path"
import { defineConfig } from "@farmfe/core"

export default defineConfig({
	compilation: {
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src")
			}
		}
	}
})
