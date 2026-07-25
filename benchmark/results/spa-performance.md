# SPA performance comparison

Generated 2026-07-25T07:56:38.063Z on linux 6.6.87.2-microsoft-standard-WSL2, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi 0.1.0 | 14.8 (17.8) | 64.0 (72.0) | 0.501 (0.555) | 0.103 (0.131) | 1 / 31.3 | 200 | 0 |
| React 19.2.8 | 10.3 (14.7) | 80.0 (80.0) | 0.698 (0.764) | 0.115 (0.151) | 1 / 34.8 | 192 | 0 |
| Vue 3.5.40 | 10.4 (10.6) | 68.0 (68.0) | 0.605 (0.659) | 0.073 (0.076) | 1 / 22.3 | 192 | 0 |
| Angular 21.2.18 | 20.7 (23.3) | 72.0 (72.0) | 0.687 (0.762) | 1.639 (1.642) | 0 / 0.0 | 194 | 0 |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi | 3 | 84.7 KiB | 22.8 KiB |
| React | 4 | 233.0 KiB | 72.4 KiB |
| Vue | 4 | 104.1 KiB | 38.3 KiB |
| Angular | 3 | 164.6 KiB | 54.3 KiB |

## Relative to Lumi

Values below 1.00× are lower than Lumi; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1.00× | 1.00× | 1.00× | 1.00× |
| React | 0.70× | 1.39× | 1.12× | 3.17× |
| Vue | 0.70× | 1.21× | 0.71× | 1.68× |
| Angular | 1.40× | 1.37× | 15.86× | 2.38× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1000 | 1500 | 0 to 0 | +249.5 KiB |
| React | 1000 | 1500 | 0 to 0 | +447.5 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +366.6 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +606.2 KiB |

## Reading the result

- React recorded the lowest median cold-load time
  (10.3 ms).
- Lumi recorded the lowest median route-update time
  (0.501 ms/update).
- Vue recorded the lowest median project-filter time
  (0.073 ms/update).
- Lumi requested the smallest initial compressed asset set
  (22.8 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Production React, Vue, Angular, and minified Lumi bundles are rebuilt
  unless `--skip-build` is passed.
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
