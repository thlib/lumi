# SPA performance comparison

Generated 2026-11-22T12:50:38.846Z on linux 7.0.0-43-generic, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

First render, FCP, and update timing cells show the median, with p95 in
parentheses, across 5 cache-disabled samples.

| Framework | First render ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.1.2 | 66.8 (69.4) | 176.0 (192.0) | 0.789 (0.842) | 0.116 (0.118) | 2 / 50.6 | 218 | 0 |
| Lumi build 0.1.2 | 55.5 (60.6) | 164.0 (176.0) | 0.764 (0.860) | 0.116 (0.124) | 1 / 35.2 | 208 | 0 |
| Lumi data-attribute DSL 0.1.2 | 62.7 (64.8) | 176.0 (188.0) | 1.168 (1.288) | 0.330 (0.350) | 1 / 105.5 | 586 | 0 |
| Vue 3.5.40 | 68.5 (72.1) | 184.0 (188.0) | 1.519 (1.658) | 0.134 (0.168) | 2 / 55.2 | 197 | 0 |
| React 19.2.8 | 103.2 (109.4) | 204.0 (216.0) | 1.779 (2.144) | 0.244 (0.300) | 1 / 88.5 | 197 | 0 |
| Lit 3.3.3 | 78.2 (87.2) | 180.0 (188.0) | 1.304 (1.623) | 0.162 (0.202) | 1 / 49.4 | 197 | 0 |
| Angular 21.2.18 | 75.6 (77.0) | 180.0 (188.0) | 1.711 (1.811) | 1.741 (1.780) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.1.2 | 14.2 (14.7) | 1.00× |
| Lumi build 0.1.2 | 14.2 (14.4) | 1.00× |
| Lumi data-attribute DSL 0.1.2 | 16.7 (16.8) | 1.17× |
| Vue 3.5.40 | 37.9 (38.8) | 2.66× |
| React 19.2.8 | 48.6 (48.8) | 3.42× |
| Lit 3.3.3 | 1203.9 (1204.4) | 84.58× |
| Angular 21.2.18 | 398.2 (398.2) | 27.98× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 5 | 103.1 KiB | 27.5 KiB |
| Lumi build | 3 | 91.8 KiB | 26.6 KiB |
| Lumi data-attribute DSL | 3 | 112.1 KiB | 31.4 KiB |
| Vue | 4 | 111.4 KiB | 39.9 KiB |
| React | 4 | 239.5 KiB | 73.7 KiB |
| Lit | 4 | 68.1 KiB | 21.8 KiB |
| Angular | 3 | 166.8 KiB | 54.0 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | First render | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.20× | 1.03× | 1.00× | 1.04× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.13× | 1.53× | 2.84× | 1.18× |
| Vue | 1.23× | 1.99× | 1.16× | 1.50× |
| React | 1.86× | 2.33× | 2.11× | 2.77× |
| Lit | 1.41× | 1.71× | 1.40× | 0.82× |
| Angular | 1.36× | 2.24× | 15.01× | 2.03× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +224.7 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +223.9 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +231.6 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +343.7 KiB |
| React | 1000 | 1500 | 0 to 0 | +421.2 KiB |
| Lit | 1000 | 1500 | 0 to 0 | +213.9 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +579.7 KiB |

## Reading the result

- Lumi build recorded the lowest median first-render time
  (55.5 ms).
- Lumi build recorded the lowest median route-update time
  (0.764 ms/update).
- Lumi native recorded the lowest median project-filter time
  (0.116 ms/update).
- Lumi native recorded the lowest median 20k-row filter time
  (14.2 ms/update).
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
- First render is the time from navigation start until the application puts
  its first visible page heading into the document. A visible page heading is
  a `main h1` element that has text and is not inside a `[hidden]`
  element. Before the page scripts run, the harness installs a
  `MutationObserver`. The observer records `performance.now()` when its
  callback finds the first visible page heading. For each loading strategy,
  the value includes the download, parsing, and execution of the application
  code and the first render. The value does not include the paint. FCP shows
  the first paint.
- The report does not compare `DOMContentLoaded` or load event times. An
  application that starts from a dynamic `import()` can render after the
  load event. An application that starts in a `DOMContentLoaded` listener
  renders before the load event. Because of this, these event times include
  the first render for some applications and not for others. The JSON report
  keeps `PerformanceNavigationTiming.domContentLoadedEventEnd` and
  `loadEventEnd` as the raw `domContentLoadedMs` and `loadMs` values.
- Update timings are measured inside the page with `performance.now()`.
- Tasks >10 ms are complete Chromium renderer `RunTask`
  intervals captured through the DevTools timeline. Zero means that no
  individual main-thread task crossed the threshold, not that the run was
  incomplete. Heap deltas are measured after forced garbage collection and
  indicate retained memory for this workload, not a proven leak.
- Full samples, exact dependency versions, and environment metadata are
  available in the adjacent JSON report.
