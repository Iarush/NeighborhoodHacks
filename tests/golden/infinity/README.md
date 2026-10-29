# District sites built by Infinity Services (bucket M23)

Avada WordPress sites with the "Infinity Services" footer credit. Agendas are Google Drive links whose text is the date ("2026-10-19 (PDF)"); minutes use the same link text, so each config's `link_selector` keeps only the agendas section. Handled by `discover` configs, no dedicated adapter. Three layouts, recorded Oct 29, 2026:

| File | Source | Layout and `link_selector` |
| --- | --- | --- |
| `hcmud-360-meetings.html` | `hcmud_360` (https://www.hcmud360.org/meetings/) | "Meeting Agendas" and "Meeting Minutes" h3 sections: `h3:contains("Agenda") ~ p:not(h3:contains("Minute") ~ p) a` |
| `cypress-hill-mud-1-meetings.html` | `cypress_hill_mud_1` (http://www.cypresshillmud1.com/meetings/) | year tabs, agendas in the first tab set: `.fusion-tabs-1 .tab-pane a` |
| `cypresswood-ud-district-page.html` | `cypresswood_ud` (https://www.districtdata.org/harris-county/cypresswood-utility-district/) | Agendas / Minutes table: `td:first-child a` |

Re-record with `curl -sL -A Mozilla <url> -o <file>`; tests: `tests/unit/mud-m23.test.ts`.
