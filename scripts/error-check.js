#! /usr/bin/env node

/* This script is intended to wrap an entrypoint binary call in order
    to catch specific fatal errors by observing STDOUT. When matching
    fatal errors are detected, the application will restart and the
    container entrypoint will not exit.
 */

const {spawn} = require('child_process');
const {argv, exit, stdout, stderr} = require('process');

const restartTimeoutMs = 1000;
const maxRecentErrsLen = 3;
const ignoredErrorRegexes = [
  /^.*failed to index block at height \d+\s+Error: read ECONNRESET\s*$/,
];

const [_, __, entrypoint, ...args] = argv;

runEntrypoint();

function runEntrypoint() {
  const recentIgnoredErrors = [];
  const proc = spawn(entrypoint, args);

  // Always forward STDERR
  proc.stderr.on("data", (data) => stderr.write(data));
  proc.stdout.on("data", (data) => {
    // Always forward STDOUT
    stdout.write(data);

    // NB: *all* subquery-node logs go to STDOUT
    for (const re of ignoredErrorRegexes) {
      if (re.test(data.toString())) {
        const recentErrsLen = recentIgnoredErrors.length;
        if (recentErrsLen < maxRecentErrsLen) {
          recentIgnoredErrors.splice(0, maxRecentErrsLen - recentErrsLen, data.toString());
        }

        console.error("FATAL ERROR: error-check.js match found - restarting entrypoint");

        // Ensure the child process is exited
        if (proc.exitCode === null) {
          // TODO: leave running instead?
          proc.kill();
        }

        // Restart child process
        setTimeout(() => {
          runEntrypoint(entrypoint, args);
        }, restartTimeoutMs);
      }
    }
  });

  proc.on("close", (code) => {
    // Wait for logs to be processed
    setTimeout(() => {
      const foundIgnoredErrors = recentIgnoredErrors.find(err => {
        for (const re of ignoredErrorRegexes) {
          if (re.test(err)) {
            return true;
          }
        }
        return false;
      });

      // Only exit if no ignoredErrors found
      if (typeof (foundIgnoredErrors) === "undefined") {
        // Exit with same code
        exit(code);
      }
    }, 100);
  });
}
