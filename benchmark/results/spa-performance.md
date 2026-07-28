# SPA performance comparison

Generated 2026-07-27T20:40:28.658Z on linux 6.17.0-1030-oem, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.1.0 | 31.1 (32.4) | 76.0 (76.0) | 0.271 (0.318) | 0.073 (0.075) | 1 / 22.2 | 218 | 0 |
| Lumi build 0.1.0 | 27.3 (28.8) | 76.0 (88.0) | 0.335 (0.361) | 0.073 (0.081) | 1 / 22.1 | 208 | 0 |
| Lumi data-attribute DSL 0.1.0 | 29.9 (30.7) | 80.0 (88.0) | 0.509 (0.578) | 0.186 (0.187) | 1 / 55.9 | 586 | 0 |
| Vue 3.5.40 | 8.8 (9.7) | 76.0 (80.0) | 0.483 (0.520) | 0.053 (0.056) | 1 / 16.1 | 197 | 0 |
| React 19.2.8 | 10.0 (10.2) | 84.0 (92.0) | 0.626 (0.674) | 0.106 (0.115) | 1 / 32.0 | 197 | 0 |
| Angular 21.2.18 | 35.4 (39.5) | 80.0 (92.0) | 0.614 (0.639) | 1.628 (1.663) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.1.0 | 14.0 (14.2) | 1.04× |
| Lumi build 0.1.0 | 13.4 (13.7) | 1.00× |
| Lumi data-attribute DSL 0.1.0 | 11.6 (11.7) | 0.87× |
| Vue 3.5.40 | 15.6 (15.6) | 1.17× |
| React 19.2.8 | 21.1 (21.8) | 1.58× |
| Angular 21.2.18 | 163.5 (164.3) | 12.22× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 4 | 108.4 KiB | 27.4 KiB |
| Lumi build | 3 | 97.3 KiB | 26.8 KiB |
| Lumi data-attribute DSL | 3 | 118.2 KiB | 31.7 KiB |
| Vue | 4 | 111.4 KiB | 39.9 KiB |
| React | 4 | 239.5 KiB | 73.7 KiB |
| Angular | 3 | 166.8 KiB | 54.0 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.14× | 0.81× | 1.00× | 1.02× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.10× | 1.52× | 2.53× | 1.18× |
| Vue | 0.32× | 1.44× | 0.72× | 1.49× |
| React | 0.37× | 1.87× | 1.44× | 2.75× |
| Angular | 1.30× | 1.83× | 22.20× | 2.02× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +272.7 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +271.7 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +219.4 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +345.2 KiB |
| React | 1000 | 1500 | 0 to 0 | +437.6 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +582.9 KiB |

## Reading the result

- Vue recorded the lowest median cold-load time
  (8.8 ms).
- Lumi native recorded the lowest median route-update time
  (0.271 ms/update).
- Vue recorded the lowest median project-filter time
  (0.053 ms/update).
- Lumi data-attribute DSL recorded the lowest median 20k-row filter time
  (11.6 ms/update).
- Lumi build requested the smallest initial compressed asset set
  (26.8 KiB).

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
