import { stdin, stdout, stderr } from "node:process";
import { generatePasswordHash } from "./blogger-launch-session.mjs";

if (process.argv.length > 2) {
  stderr.write("Read the password from standard input; command-line arguments are refused.\n");
  process.exitCode = 2;
} else {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const password = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
  try {
    stdout.write(`${await generatePasswordHash(password)}\n`);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
