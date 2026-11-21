// Vercel's build (vercel.json, spec 15.3): builds the app, then, in Production only,
// applies the database migrations and the seed (safe to run again). They run after a
// successful build, so a broken build never touches the database; a failed migration
// fails the deployment, and the previous one keeps serving. Preview builds never touch
// the Production database.
import { execSync } from "node:child_process";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit" });
}

run("next build");

if (process.env.VERCEL_ENV === "production") {
  run("prisma migrate deploy");
  run("prisma db seed");
} else {
  console.log(
    `\nNo migrations: VERCEL_ENV is "${process.env.VERCEL_ENV ?? ""}", not "production".`,
  );
}
