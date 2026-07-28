# SPA performance comparison

Generated 2026-07-28T20:22:50.494Z on linux 6.17.0-1030-oem, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.1.0 | 33.4 (35.4) | 76.0 (80.0) | 0.339 (0.412) | 0.076 (0.083) | 1 / 22.9 | 218 | 0 |
| Lumi build 0.1.0 | 31.1 (45.2) | 76.0 (108.0) | 0.343 (0.385) | 0.077 (0.079) | 1 / 23.3 | 208 | 0 |
| Lumi data-attribute DSL 0.1.0 | 31.9 (34.3) | 80.0 (96.0) | 0.527 (0.579) | 0.190 (0.202) | 1 / 57.3 | 586 | 0 |
| Vue 3.5.40 | 10.1 (11.0) | 80.0 (88.0) | 0.519 (0.545) | 0.058 (0.059) | 1 / 17.5 | 197 | 0 |
| React 19.2.8 | 9.7 (10.7) | 88.0 (96.0) | 0.651 (0.686) | 0.128 (0.142) | 1 / 38.7 | 197 | 0 |
| Lit 3.3.3 | 11.7 (13.0) | 84.0 (108.0) | 0.454 (0.496) | 0.067 (0.072) | 1 / 20.3 | 197 | 0 |
| Angular 21.2.18 | 37.0 (42.2) | 80.0 (84.0) | 0.666 (0.671) | 1.641 (1.655) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.1.0 | 16.9 (17.0) | 1.18× |
| Lumi build 0.1.0 | 14.3 (14.7) | 1.00× |
| Lumi data-attribute DSL 0.1.0 | 12.3 (12.4) | 0.86× |
| Vue 3.5.40 | 17.8 (17.9) | 1.25× |
| React 19.2.8 | 23.0 (23.1) | 1.61× |
| Lit 3.3.3 | 483.4 (491.1) | 33.85× |
| Angular 21.2.18 | 173.9 (178.4) | 12.17× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 5 | 110.1 KiB | 28.2 KiB |
| Lumi build | 3 | 98.7 KiB | 27.3 KiB |
| Lumi data-attribute DSL | 3 | 119.0 KiB | 32.0 KiB |
| Vue | 4 | 111.4 KiB | 39.9 KiB |
| React | 4 | 239.5 KiB | 73.7 KiB |
| Lit | 4 | 68.1 KiB | 21.8 KiB |
| Angular | 3 | 166.8 KiB | 54.0 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.07× | 0.99× | 0.98× | 1.04× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.03× | 1.53× | 2.46× | 1.18× |
| Vue | 0.32× | 1.51× | 0.75× | 1.46× |
| React | 0.31× | 1.90× | 1.66× | 2.70× |
| Lit | 0.38× | 1.32× | 0.86× | 0.80× |
| Angular | 1.19× | 1.94× | 21.22× | 1.98× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +272.9 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +271.7 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +220.8 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +346.0 KiB |
| React | 1000 | 1500 | 0 to 0 | +437.2 KiB |
| Lit | 1000 | 1500 | 0 to 0 | +218.8 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +588.4 KiB |

## Reading the result

- React recorded the lowest median cold-load time
  (9.7 ms).
- Lumi native recorded the lowest median route-update time
  (0.339 ms/update).
- Vue recorded the lowest median project-filter time
  (0.058 ms/update).
- Lumi data-attribute DSL recorded the lowest median 20k-row filter time
  (12.3 ms/update).
- Lit requested the smallest initial compressed asset set
  (21.8 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Built applications are rebuilt unless `--skip-build` is passed. Lumi native
  is served as its browser-loaded module graph; Lumi build is assembled and
  minified with esbuild.
- Framework order rotates between samples. Browser HTTP cache is disabled.
- Each framework sample uses a fresh browser process, bounding retained state
  from the intentionally large Records workload.
- Every sample runs two unmeasured route cycles and one filter cycle to warm
  JIT and scheduler paths.
- A measured route cycle renders Projects → Activity → Teams → Overview.
- A measured filter cycle renders Active → Planning → All and verifies
  2 → 2 → 4 project cards.
- A separate 20k-row cycle renders Alpha → Beta → All and verifies
  5,000 → 5,000 → 20,000 rows. It runs after the established DOM and
  heap stability measurements.
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
