# SPA performance comparison

Generated 2026-11-23T15:57:50.719Z on linux 7.0.0-43-generic, Node v24.19.0,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

First render, FCP, and update timing cells show the median, with p95 in
parentheses, across 5 cache-disabled samples.

| Framework | First render ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.2.0 | 71.8 (90.1) | 196.0 (232.0) | 0.838 (1.196) | 0.074 (0.082) | 2 / 42.6 | 218 | 0 |
| Lumi build 0.2.0 | 60.9 (72.3) | 196.0 (204.0) | 0.908 (1.081) | 0.074 (0.106) | 2 / 40.9 | 208 | 0 |
| Lumi data-attribute DSL 0.2.0 | 76.2 (84.8) | 200.0 (224.0) | 1.532 (1.776) | 0.358 (0.386) | 2 / 126.5 | 556 | 0 |
| Vue 3.5.46 | 80.1 (81.5) | 216.0 (296.0) | 2.200 (2.353) | 0.171 (0.187) | 2 / 61.6 | 197 | 0 |
| React 19.3.1 | 108.4 (129.9) | 232.0 (264.0) | 2.325 (2.600) | 0.334 (0.375) | 2 / 123.2 | 197 | 0 |
| Lit 3.3.3 | 92.5 (97.5) | 208.0 (216.0) | 1.732 (1.773) | 0.192 (0.202) | 1 / 58.6 | 197 | 0 |
| Angular 22.3.0 | 87.0 (89.3) | 208.0 (216.0) | 2.408 (2.540) | 1.826 (1.828) | 1 / 19.4 | 200 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.2.0 | 18.2 (20.2) | 0.93× |
| Lumi build 0.2.0 | 19.6 (21.4) | 1.00× |
| Lumi data-attribute DSL 0.2.0 | 24.1 (26.4) | 1.23× |
| Vue 3.5.46 | 42.4 (43.1) | 2.16× |
| React 19.3.1 | 58.0 (65.7) | 2.96× |
| Lit 3.3.3 | 1263.0 (1336.6) | 64.33× |
| Angular 22.3.0 | 435.9 (467.0) | 22.20× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 5 | 99.3 KiB | 26.3 KiB |
| Lumi build | 3 | 88.5 KiB | 25.6 KiB |
| Lumi data-attribute DSL | 3 | 108.9 KiB | 30.4 KiB |
| Vue | 4 | 114.5 KiB | 41.1 KiB |
| React | 4 | 267.6 KiB | 82.1 KiB |
| Lit | 4 | 67.5 KiB | 21.7 KiB |
| Angular | 3 | 168.4 KiB | 54.8 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | First render | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.18× | 0.92× | 1.00× | 1.03× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.25× | 1.69× | 4.82× | 1.19× |
| Vue | 1.32× | 2.42× | 2.30× | 1.61× |
| React | 1.78× | 2.56× | 4.49× | 3.21× |
| Lit | 1.52× | 1.91× | 2.58× | 0.85× |
| Angular | 1.43× | 2.65× | 24.57× | 2.14× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +198.0 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +195.8 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +210.1 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +350.2 KiB |
| React | 1000 | 1500 | 0 to 0 | +419.6 KiB |
| Lit | 1000 | 1500 | 0 to 0 | +207.7 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +581.8 KiB |

## Reading the result

- Lumi build recorded the lowest median first-render time
  (60.9 ms).
- Lumi native recorded the lowest median route-update time
  (0.838 ms/update).
- Lumi build recorded the lowest median project-filter time
  (0.074 ms/update).
- Lumi native recorded the lowest median 20k-row filter time
  (18.2 ms/update).
- Lit requested the smallest initial compressed asset set
  (21.7 KiB).

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
