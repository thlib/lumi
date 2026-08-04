# SPA performance comparison

Generated 2026-08-04T15:41:08.517Z on linux 6.6.87.2-microsoft-standard-WSL2, Node v26.5.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.1.0 | 33.0 (85.6) | 84.0 (176.0) | 0.484 (0.502) | 0.085 (0.086) | 1 / 26.0 | 218 | 0 |
| Lumi build 0.1.0 | 28.7 (29.1) | 80.0 (84.0) | 0.484 (0.513) | 0.082 (0.085) | 1 / 25.0 | 208 | 0 |
| Lumi data-attribute DSL 0.1.0 | 32.1 (34.2) | 84.0 (88.0) | 0.605 (0.652) | 0.193 (0.199) | 1 / 58.3 | 586 | 0 |
| Vue 3.5.40 | 11.4 (12.1) | 84.0 (88.0) | 0.621 (0.661) | 0.076 (0.077) | 1 / 23.0 | 197 | 0 |
| React 19.2.8 | 10.9 (11.7) | 92.0 (108.0) | 0.783 (1.041) | 0.135 (0.167) | 1 / 48.5 | 197 | 0 |
| Lit 3.3.3 | 11.8 (13.5) | 88.0 (92.0) | 0.556 (0.610) | 0.084 (0.114) | 1 / 25.5 | 197 | 0 |
| Angular 21.2.18 | 35.8 (40.0) | 88.0 (92.0) | 0.718 (0.805) | 1.635 (1.645) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.1.0 | 12.5 (13.0) | 0.98× |
| Lumi build 0.1.0 | 12.7 (13.3) | 1.00× |
| Lumi data-attribute DSL 0.1.0 | 16.2 (17.0) | 1.27× |
| Vue 3.5.40 | 17.1 (19.5) | 1.34× |
| React 19.2.8 | 18.9 (19.3) | 1.48× |
| Lit 3.3.3 | 519.6 (528.0) | 40.81× |
| Angular 21.2.18 | 154.8 (156.1) | 12.15× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 5 | 108.1 KiB | 27.9 KiB |
| Lumi build | 3 | 96.7 KiB | 26.9 KiB |
| Lumi data-attribute DSL | 3 | 117.0 KiB | 31.7 KiB |
| Vue | 4 | 111.4 KiB | 39.9 KiB |
| React | 4 | 239.5 KiB | 73.7 KiB |
| Lit | 4 | 68.1 KiB | 21.8 KiB |
| Angular | 3 | 166.8 KiB | 54.0 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.15× | 1.00× | 1.03× | 1.04× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.12× | 1.25× | 2.35× | 1.18× |
| Vue | 0.40× | 1.28× | 0.92× | 1.48× |
| React | 0.38× | 1.62× | 1.64× | 2.74× |
| Lit | 0.41× | 1.15× | 1.02× | 0.81× |
| Angular | 1.25× | 1.48× | 19.85× | 2.01× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +255.9 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +254.6 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +231.1 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +345.4 KiB |
| React | 1000 | 1500 | 0 to 0 | +416.4 KiB |
| Lit | 1000 | 1500 | 0 to 0 | +216.2 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +579.0 KiB |

## Reading the result

- React recorded the lowest median cold-load time
  (10.9 ms).
- Lumi build recorded the lowest median route-update time
  (0.484 ms/update).
- Vue recorded the lowest median project-filter time
  (0.076 ms/update).
- Lumi native recorded the lowest median 20k-row filter time
  (12.5 ms/update).
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
