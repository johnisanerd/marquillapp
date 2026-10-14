import type { EvalOptions } from './eval-runner';

export const DEFAULT_CONCURRENCY = 2;
/** Twenty runs of up to four minutes at two a time is about 40 minutes of work. */
export const DEFAULT_TIMEOUT_MIN = 120;
export const DEFAULT_POLL_MS = 10_000;

export interface EvalCliOptions extends EvalOptions {
  /** Where to write the full result as JSON. */
  jsonPath?: string;
}

export const EVAL_USAGE = [
  'Usage: bun run eval:documents [options]',
  '',
  '  --concurrency <n>   runs in flight at once (default 2)',
  '  --timeout-min <m>   minutes to wait for every run to end (default 120)',
  '  --json <path>       also write the full result as JSON',
].join('\n');

/** Parses the script's flags, accepting both `--flag value` and `--flag=value`. */
export function parseEvalArgs(argv: readonly string[]): EvalCliOptions {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') continue; // npm-style separator
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    if (!['--concurrency', '--timeout-min', '--json'].includes(flag)) {
      throw new Error(`Unknown argument: ${argv[i]}\n\n${EVAL_USAGE}`);
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === '') {
      throw new Error(`${flag} needs a value\n\n${EVAL_USAGE}`);
    }
    values.set(flag, value);
  }

  const concurrency = Number(
    values.get('--concurrency') ?? DEFAULT_CONCURRENCY,
  );
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('--concurrency must be a whole number of at least 1');
  }
  const timeoutMin = Number(values.get('--timeout-min') ?? DEFAULT_TIMEOUT_MIN);
  if (!Number.isFinite(timeoutMin) || timeoutMin <= 0) {
    throw new Error('--timeout-min must be a number of minutes above 0');
  }
  return {
    concurrency,
    timeoutMs: timeoutMin * 60 * 1000,
    pollMs: DEFAULT_POLL_MS,
    jsonPath: values.get('--json'),
  };
}
