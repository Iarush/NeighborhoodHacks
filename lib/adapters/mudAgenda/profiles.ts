// Law-firm profiles for MUD agendas (mud-code-parser-spec §3.4).
// A water district's agenda follows the template of its general counsel, not its website
// vendor, so the parser's per-template settings are keyed by firm. Phase 0 fills in `detect`
// (who wrote this agenda); Phase 1 adds the parsing fields where the generic rules fail.

/** How a firm was recognized, strongest first. */
export type FirmEvidence = 'phone' | 'name' | 'doc_id' | 'template' | 'none';

export type FirmProfile = {
  id: string;
  /** For reports only. */
  label: string;
  /**
   * Strong evidence: the firm's name or office. A name can also appear inside an item
   * ("engage X as special counsel"), so when several firms match, the latest match wins.
   */
  detect: RegExp[];
  /** Strong evidence: attorney or paralegal phones from the disability notice (10 digits). */
  phones?: string[];
  /** Medium evidence: the firm's document-management ID footer. */
  doc_id?: RegExp[];
  /**
   * Weak evidence: wording or phones seen only in this firm's agendas in the Nov 2026 survey
   * but never next to its name. Used only when nothing stronger matches any firm.
   */
  template?: RegExp[];
  template_phones?: string[];
  item_start?: RegExp;
  sub_item_start?: RegExp;
  list_intro?: RegExp;
  extra_boilerplate?: RegExp[];
};

export type FirmMatch = { id: string; by: FirmEvidence };

/** A phone number in any of the usual spellings: (713) 860-6400, 713-860-6400, 713.860.6400. */
export function phone(digits: string): RegExp {
  const [a, b, c] = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  return new RegExp(`(?<!\\d)\\(?${a}\\)?[\\s.-]*${b}[\\s.-]${c}(?!\\d)`);
}

/**
 * Boilerplate wording as a pattern that survives PDF line breaks and curly apostrophes:
 * phrase("the District's paralegal") also matches "the District’s\nparalegal".
 */
export function phrase(words: string): RegExp {
  const src = words
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]"))
    .join('\\s+');
  return new RegExp(src, 'i');
}

export const GENERIC: FirmProfile = { id: 'generic', label: 'Not identified', detect: [] };

// Order matters only as a tie-breaker; detectFirm prefers the latest match.
export const FIRM_PROFILES: FirmProfile[] = [
  {
    id: 'abhr',
    label: 'Allen Boone Humphries Robinson',
    detect: [/Allen,?\s+Boone\s+Humphries/i], phones: ['7138606400'],
  },
  {
    id: 'sph',
    label: 'Schwartz, Page & Harding',
    // 623-4531 appears with the firm's name on 39 agendas. The spec's (713) 880-3800 appears on
    // agendas without any firm name; it is kept as template-level evidence below until confirmed.
    detect: [/Schwartz,?\s+Page\s*(?:&|and)\s*Harding/i], phones: ['7136234531'],
    template_phones: ['7138803800'],
  },
  {
    id: 'coats_rose',
    label: 'Coats Rose',
    detect: [/Coats[\W_lI|]{0,3}Rose/i], phones: ['7136510111'],
  },
  {
    id: 'radcliffe_bobbitt',
    label: 'Radcliffe Bobbitt / Radcliffe Adams Barner',
    detect: [/Radcliffe,?\s+(?:Bobbitt|Adams\s+Barner)/i], phones: ['7132371221'],
  },
  {
    id: 'norton_rose',
    label: 'Norton Rose Fulbright',
    // Paralegal lines in the disability notice, each seen beside the firm's name.
    detect: [/Norton\s+Rose\s+Fulbright/i], phones: ['7136515589', '7136518353'],
    template: [
      phrase("requested to contact the District's paralegal at"),
      phrase('At such meeting, the Board will consider and act on the following matters'),
    ],
  },
  {
    id: 'johnson_petrov',
    label: 'Johnson Petrov',
    detect: [/Johnson\s+Petrov/i], phones: ['7134898977'],
    template: [
      phrase('Pursuant to Chapter 551 of the Texas Government Code, Subchapter D'),
      phrase('At this meeting, the Board will consider and authorize appropriate action'),
    ],
  },
  {
    id: 'polley_garza',
    label: 'Polley Garza',
    detect: [/Polley\s+Garza/i],
  },
  {
    id: 'roach',
    label: 'Roach & Associates',
    detect: [/Roach\s*(?:&|and)\s*Associates/i], phones: ['8327891899'],
  },
  {
    id: 'harris_law_firm',
    label: 'The Harris Law Firm',
    detect: [/Harris\s+Law\s+Firm/i], phones: ['7138207322'],
  },
  {
    id: 'marks_richardson',
    label: 'Marks Richardson',
    detect: [/Marks\s+Richardson/i], phones: ['7139429922'],
  },
  {
    // Meetings held "at the office of Greenberg Traurig, LLP" (counsel's office); no firm signs the agenda.
    id: 'greenberg_traurig',
    label: 'Greenberg Traurig',
    detect: [/\bat\s+(?:the\s+offices?\s+of\s+)?Greenberg\s+Traurig/i],
    doc_id: [/\bACTIVE\s+\d{6,10}v\d+\b/],
  },
  {
    id: 'hunton',
    label: 'Hunton Andrews Kurth',
    detect: [/\bat\s+(?:the\s+offices?\s+of\s+)?Hunton\s+Andrews\s+Kurth/i],
  },
  {
    // A firm whose agendas carry a client-matter footer "9NNNN-002 NNNNNN.N" and are signed
    // "Attorney for the District" with no firm name. Recognized by template only; name unknown.
    id: 'matter_002',
    label: 'Unnamed firm (9NNNN-002 matter IDs)',
    detect: [],
    doc_id: [/\b9\d{4}-002\s+6\d{5}\.\d+\b/],
    template: [phrase('By state law, comments by the Board members on any item not on the agenda')],
  },
  {
    // Agendas that open with typist initials ("JRY/yc", "MWB:ec") and list "Convene Executive
    // Session pursuant to Open Meetings Act, Texas Government Code Sec. 551.071 to consider legal
    // matters" as an item. Unsigned, no phone; one firm's template, name unknown.
    id: 'initials_header',
    label: 'Unnamed firm (typist-initials header)',
    detect: [],
    template: [
      /^\W{0,3}(?:[A-Z]\s?){2,4}[/:]\s?[a-z]{2}\s/,
      /Sec\.\s*5\s*51\.\s*071\s+to\s+consider\s+legal\s+matters/i,
    ],
  },
  {
    // Disability-notice phones that name no firm. Each is one firm's template (2 districts each).
    id: 'phone_2815006050',
    label: 'Unnamed firm ((281) 500-6050)',
    detect: [],
    phones: ['2815006050'],
  },
  {
    id: 'phone_2812100043',
    label: 'Unnamed firm (281-210-0043)',
    detect: [],
    phones: ['2812100043'],
  },
];

const ALL = [...FIRM_PROFILES];

export function profileById(id: string): FirmProfile {
  return ALL.find((p) => p.id === id) ?? GENERIC;
}

/** Position of the last match of `re` in `text`, or -1. */
function lastMatch(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let last = -1;
  for (const m of text.matchAll(g)) last = m.index;
  return last;
}

/**
 * Which firm wrote this agenda. Strong evidence (name or phone) first; among several firms,
 * the one matched latest wins, because the signature and disability notice close the agenda
 * while other firms appear earlier, inside items. Then doc-ID footers, then template wording.
 */
export function detectFirm(text: string, profiles: readonly FirmProfile[] = FIRM_PROFILES): FirmMatch {
  const tiers: { res: (p: FirmProfile) => { re: RegExp; by: Exclude<FirmEvidence, 'none'> }[] }[] = [
    { res: (p) => [...p.detect.map((re) => ({ re, by: 'name' as const })), ...(p.phones ?? []).map((d) => ({ re: phone(d), by: 'phone' as const }))] },
    { res: (p) => (p.doc_id ?? []).map((re) => ({ re, by: 'doc_id' as const })) },
    { res: (p) => [...(p.template ?? []), ...(p.template_phones ?? []).map(phone)].map((re) => ({ re, by: 'template' as const })) },
  ];
  for (const tier of tiers) {
    let best: { id: string; at: number; by: Exclude<FirmEvidence, 'none'> } | undefined;
    for (const p of profiles) {
      for (const { re, by } of tier.res(p)) {
        const at = lastMatch(text, re);
        if (at >= 0 && (!best || at > best.at)) best = { id: p.id, at, by };
      }
    }
    if (best) return { id: best.id, by: best.by };
  }
  return { id: GENERIC.id, by: 'none' };
}
