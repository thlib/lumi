# SPA performance comparison

Generated 2026-07-27T17:43:45.667Z on linux 6.17.0-1030-oem, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.1.0 | 31.1 (33.1) | 76.0 (80.0) | 0.327 (0.334) | 0.076 (0.079) | 1 / 23.0 | 218 | 0 |
| Lumi build 0.1.0 | 28.1 (28.3) | 76.0 (88.0) | 0.338 (0.508) | 0.074 (0.089) | 1 / 22.5 | 208 | 0 |
| Lumi elements 0.1.0 | 60.9 (62.1) | 72.0 (76.0) | 0.346 (0.396) | 0.078 (0.088) | 1 / 23.6 | 219 | 0 |
| Vue 3.5.40 | 10.1 (10.6) | 84.0 (96.0) | 0.522 (0.585) | 0.058 (0.080) | 1 / 17.5 | 197 | 0 |
| React 19.2.8 | 9.5 (10.4) | 92.0 (104.0) | 0.721 (0.738) | 0.127 (0.136) | 1 / 38.4 | 197 | 0 |
| Angular 21.2.18 | 35.8 (36.4) | 88.0 (100.0) | 0.637 (0.748) | 1.655 (1.702) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.1.0 | 14.5 (14.7) | 1.02× |
| Lumi build 0.1.0 | 14.1 (14.4) | 1.00× |
| Lumi elements 0.1.0 | 13.9 (14.0) | 0.98× |
| Vue 3.5.40 | 15.9 (16.0) | 1.12× |
| React 19.2.8 | 22.4 (23.3) | 1.59× |
| Angular 21.2.18 | 165.7 (166.8) | 11.72× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 4 | 105.0 KiB | 27.0 KiB |
| Lumi build | 3 | 94.1 KiB | 26.3 KiB |
| Lumi elements | 4 | 105.9 KiB | 27.2 KiB |
| Vue | 4 | 108.2 KiB | 39.3 KiB |
| React | 4 | 236.6 KiB | 73.3 KiB |
| Angular | 3 | 168.4 KiB | 55.2 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.11× | 0.97× | 1.02× | 1.02× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi elements | 2.17× | 1.03× | 1.05× | 1.03× |
| Vue | 0.36× | 1.55× | 0.78× | 1.50× |
| React | 0.34× | 2.13× | 1.70× | 2.79× |
| Angular | 1.27× | 1.89× | 22.27× | 2.10× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +276.9 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +276.0 KiB |
| Lumi elements | 1000 | 1500 | 0 to 0 | +281.6 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +374.3 KiB |
| React | 1000 | 1500 | 0 to 0 | +460.1 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +623.1 KiB |

## Reading the result

- React recorded the lowest median cold-load time
  (9.5 ms).
- Lumi native recorded the lowest median route-update time
  (0.327 ms/update).
- Vue recorded the lowest median project-filter time
  (0.058 ms/update).
- Lumi elements recorded the lowest median 20k-row filter time
  (13.9 ms/update).
- Lumi build requested the smallest initial compressed asset set
  (26.3 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Built applications are rebuilt unless `--skip-build` is passed. Lumi native
  is served as its browser-loaded module graph; Lumi build and Lumi elements
  are assembled and minified with esbuild.
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
