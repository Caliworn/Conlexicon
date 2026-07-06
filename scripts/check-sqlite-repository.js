const { runSqliteSchemaCheck } = require("./check-sqlite-schema");
const { runSqliteLifecycleCheck } = require("./check-sqlite-lifecycle");

async function main() {
  await runSqliteSchemaCheck();
  await runSqliteLifecycleCheck();
  console.log("SQLite repository smoke checks passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
