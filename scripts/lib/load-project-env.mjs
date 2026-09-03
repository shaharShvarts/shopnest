import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export const projectEnvPath = fileURLToPath(
  new URL("../../.env", import.meta.url)
);

export function loadProjectEnv(envFilePath = projectEnvPath) {
  if (!existsSync(envFilePath)) return false;
  loadEnvFile(envFilePath);
  return true;
}
