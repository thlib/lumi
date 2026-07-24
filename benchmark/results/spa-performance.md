# SPA performance comparison

Generated 2026-07-24T19:22:26.090Z on linux 6.17.0-1028-oem, Node v22.12.0,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Long tasks count / ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi 0.1.0 | 25.1 (27.6) | 60.0 (68.0) | 1.361 (1.460) | 0.955 (1.002) | 1 / 287.0 | 566 | 0 |
| React 19.2.8 | 7.8 (8.1) | 64.0 (68.0) | 0.535 (0.559) | 0.070 (0.093) | 0 / 0.0 | 192 | 0 |
| Vue 3.5.40 | 7.5 (7.9) | 56.0 (60.0) | 0.440 (0.486) | 0.043 (0.050) | 0 / 0.0 | 192 | 0 |
| Angular 21.2.18 | 21.3 (22.6) | 52.0 (52.0) | 0.558 (0.626) | 1.723 (1.759) | 0 / 0.0 | 194 | 0 |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi | 17 | 179.9 KiB | 42.6 KiB |
| React | 4 | 233.0 KiB | 72.4 KiB |
| Vue | 4 | 104.1 KiB | 38.3 KiB |
| Angular | 3 | 164.6 KiB | 54.3 KiB |

## Relative to Lumi

Values below 1.00× are lower than Lumi; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1.00× | 1.00× | 1.00× | 1.00× |
| React | 0.31× | 0.39× | 0.07× | 1.70× |
| Vue | 0.30× | 0.32× | 0.05× | 0.90× |
| Angular | 0.85× | 0.41× | 1.80× | 1.27× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1000 | 1500 | 0 to 0 | +184.8 KiB |
| React | 1000 | 1500 | 0 to 0 | +370.6 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +299.1 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +554.0 KiB |

## Reading the result

- Vue recorded the lowest median cold-load time
  (7.5 ms).
- Vue recorded the lowest median route-update time
  (0.440 ms/update).
- Vue recorded the lowest median project-filter time
  (0.043 ms/update).
- Vue requested the smallest initial compressed asset set
  (38.3 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Production React, Vue, and Angular bundles are rebuilt unless
  `--skip-build` is passed. Lumi is served as its native ES modules.
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
- Long tasks use the browser's 50 ms Long Tasks API threshold. Heap deltas are
  measured after forced garbage collection and indicate retained memory for
  this workload, not a proven leak.
- Full samples, exact dependency versions, and environment metadata are
  available in the adjacent JSON report.
