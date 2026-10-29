# Wix district sites (bucket M14)

Wix sites share only the builder, not a layout, so each gets its own `discover` config. File URLs are
opaque (`/_files/ugd/<id>.pdf`), so the configs match the link text. Recorded Oct 29, 2026, with
`<script>` and `<style>` blocks removed to keep the files small (links and text are unchanged).

| File | Source |
| --- | --- |
| `clcwa-board-information.html` | `clear_lake_city_wa` (https://www.clcwa.org/board-information): "View Document" links, dated from the row (`date_from: row_text`) |
| `wcid110-board-meetings.html` | `hcwcid_110` (https://www.wcid110.com/board-meetings): dated links, agendas list picked by `link_selector` |
| `hcmud238-board-meetings.html` | `hcmud_238` (https://www.hcmud238.com/copy-of-board-meetings): only the newest date is a link |

Re-record with `curl -sL -A Mozilla <url> -o <file>`, then strip scripts and styles; tests: `tests/unit/mud-m14.test.ts`.
