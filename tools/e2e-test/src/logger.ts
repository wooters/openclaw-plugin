/**
 * Colored console output for the E2E test tool
 */

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function info(message: string): void {
  console.log(
    `${colors.dim}[${timestamp()}]${colors.reset} ${colors.blue}[INFO]${colors.reset} ${message}`,
  );
}

export function success(message: string): void {
  console.log(
    `${colors.dim}[${timestamp()}]${colors.reset} ${colors.green}[OK]${colors.reset} ${message}`,
  );
}

export function warn(message: string): void {
  console.log(
    `${colors.dim}[${timestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${message}`,
  );
}

export function error(message: string): void {
  console.log(
    `${colors.dim}[${timestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${message}`,
  );
}

export function debug(message: string): void {
  if (verboseEnabled) {
    console.log(
      `${colors.dim}[${timestamp()}] [DEBUG] ${message}${colors.reset}`,
    );
  }
}

export function testPass(name: string, duration: number): void {
  console.log(
    `  ${colors.green}PASS${colors.reset} ${name} ${colors.dim}(${duration}ms)${colors.reset}`,
  );
}

export function testFail(name: string, duration: number, err: string): void {
  console.log(
    `  ${colors.red}FAIL${colors.reset} ${name} ${colors.dim}(${duration}ms)${colors.reset}`,
  );
  console.log(`       ${colors.red}${err}${colors.reset}`);
}

export function testSkip(name: string): void {
  console.log(`  ${colors.yellow}SKIP${colors.reset} ${name}`);
}

export function header(text: string): void {
  console.log();
  console.log(
    `${colors.magenta}${colors.bright}${text}${colors.reset}`,
  );
  console.log();
}

export function summary(
  passed: number,
  failed: number,
  skipped: number,
  totalDuration: number,
): void {
  console.log();
  const total = passed + failed + skipped;
  const color = failed > 0 ? colors.red : colors.green;
  console.log(
    `${color}${colors.bright}Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""}${skipped > 0 ? `, ${skipped} skipped` : ""} (${Math.round(totalDuration / 1000)}s)${colors.reset}`,
  );
  console.log();
}
