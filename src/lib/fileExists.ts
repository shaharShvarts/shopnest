import { access, constants } from "fs/promises";

export const fileExists = async (path?: string): Promise<boolean> => {
  if (!path) return false;
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};
