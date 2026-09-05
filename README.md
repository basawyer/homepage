# homepage

Blake Sawyer's personal site. Restored from a Wayback Machine snapshot, then redesigned.

## Run it locally

```bash
python3 -m http.server 8088
```

Then open http://127.0.0.1:8088/

## Structure

- `index.html` — single scrolling page: Abstract, Research, Distractions, Contact
- `sailing/` — separate page for SV Sharlie (Blake's sailboat), kept up to date automatically
- `assets/css/style.css` — all styles, no framework
- `assets/js/main.js` — small vanilla JS (scroll-reveal, nav highlighting)
- `assets/img/` — project photos
- `assets/files/` — CV PDF, two presentation decks, one project video

## Design

Dark background, single accent color, one scrolling page. Nav bar is sticky; most links
anchor-scroll within the page, "Sailing" and "Download CV" are the two that go elsewhere
(a separate page, and a file, respectively).

## Content provenance

The site content — text, project write-ups, images — is restored from Wayback Machine
captures of the original blakesawyer.net (primary snapshot: 20250212074749), with several
project photos re-fetched from their original 2012–2014 upload paths after the final site's
HTML turned out to reference a 2016 path that Wayback never actually crawled.

## Next up

The `/sailing` page is a placeholder — structure and nav are in place, live data from the
boat's onboard SignalK feed (position, conditions, log) is coming next.
