export async function readAdminPassword() {
  const configured = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (configured) return configured;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Set ADMIN_BOOTSTRAP_PASSWORD when an interactive terminal is unavailable"
    );
  }

  process.stdout.write("Password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let password = "";
    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (character) => {
      if (character === "\u0003") return finish(new Error("Cancelled"));
      if (character === "\r" || character === "\n") return finish();
      if (character === "\u007f" || character === "\b") {
        password = password.slice(0, -1);
        return;
      }
      password += character;
    };
    process.stdin.on("data", onData);
  });
}
