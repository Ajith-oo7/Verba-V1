const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const python =
  process.platform === "win32"
    ? path.join(root, "apps", "agent", ".venv", "Scripts", "python.exe")
    : path.join(root, "apps", "agent", ".venv", "bin", "python");
const script = path.join(root, "packages", "corpus", "eval_corpus.py");

const result = spawnSync(python, [script], { stdio: "inherit", cwd: root });
process.exit(result.status ?? 1);
