# SPA performance comparison

Generated 2026-07-26T18:50:05.840Z on linux 6.6.87.2-microsoft-standard-WSL2, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi 0.1.0 | 16.8 (23.3) | 72.0 (80.0) | 0.555 (0.571) | 0.117 (0.123) | 1 / 35.3 | 212 | 0 |
| React 19.2.8 | 11.0 (12.3) | 80.0 (92.0) | 0.762 (0.861) | 0.128 (0.133) | 1 / 39.8 | 193 | 0 |
| Vue 3.5.40 | 10.6 (12.5) | 72.0 (80.0) | 0.671 (0.703) | 0.079 (0.082) | 1 / 23.9 | 193 | 0 |
| Angular 21.2.18 | 22.1 (28.6) | 72.0 (76.0) | 0.820 (0.889) | 1.652 (1.661) | 0 / 0.0 | 195 | 0 |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi | 3 | 96.4 KiB | 25.2 KiB |
| React | 4 | 232.2 KiB | 72.2 KiB |
| Vue | 4 | 103.3 KiB | 38.1 KiB |
| Angular | 3 | 163.7 KiB | 54.0 KiB |

## Relative to Lumi

Values below 1.00× are lower than Lumi; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1.00× | 1.00× | 1.00× | 1.00× |
| React | 0.65× | 1.37× | 1.10× | 2.86× |
| Vue | 0.63× | 1.21× | 0.67× | 1.51× |
| Angular | 1.32× | 1.48× | 14.16× | 2.14× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1000 | 1500 | 0 to 0 | +271.6 KiB |
| React | 1000 | 1500 | 0 to 0 | +448.0 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +361.0 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +605.3 KiB |

## Reading the result

- Vue recorded the lowest median cold-load time
  (10.6 ms).
- Lumi recorded the lowest median route-update time
  (0.555 ms/update).
- Vue recorded the lowest median project-filter time
  (0.079 ms/update).
- Lumi requested the smallest initial compressed asset set
  (25.2 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Every application is served from a production build, rebuilt unless
  `--skip-build` is passed. Lumi's example is bundled and minified with
  esbuild from the same unbundled source the repository serves directly.
- Framework order rotates between samples. Browser HTTP cache is disabled.
- Every sample runs two unmeasured route cycles and one filter cycle to warm
  JIT and scheduler paths.
- A measured route cycle renders Projects → Activity → Teams → Overview.
- A measured filter cycle renders Active → Planning → All and verifies
  2 → 2 → 4 project cards.
- CSS transitions and animations are disabled; the viewport is 1440 × 1000
  with reduced motion enabled.
- Cold load is `PerformanceNavigationTiming.loadEventEnd`. Update timings are
  measured inside the page with `performance.now()`.
- Tasks >10 ms are complete Chromium renderer `RunTask`
  intervals captured through the DevTools timeline. Zero means that no
  individual main-thread task crossed the threshold, not that the run was
  incomplete. Heap deltas are measured after forced garbage collection and
  indicate retained memory for this workload, not a proven leak.
- Full samples, exact dependency versions, and environment metadata are
  available in the adjacent JSON report.
