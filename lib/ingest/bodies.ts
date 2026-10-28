import type { QuizBodyType } from '@/lib/contracts/bodyTypes';
import { QUIZ_BODY_TYPES } from '@/lib/contracts/bodyTypes';
import { loadBodyCatalog, type CatalogBody } from './catalog';

// The `bodies` rows ingest needs before it can write meetings and items (they reference bodies.id).
// P1 owns the bodies table: these rows are inserted only when missing and never overwritten,
// so P1 can fill in descriptions, elected_or_appointed, tax_set_by_body_id and the rest.
// The list comes from the body catalog (data/bodies*.yaml via ./catalog), so it can't drift from
// the seed script. IDs match data/sources.yaml (including section_body_map) and lib/lookup/standIn.ts.
// sms_eligible follows Project_Plan.md: city councils, Commissioners Court (with Flood Control),
// school boards, community college boards, MUDs and ESDs.

export type BodySeed = {
  id: string;
  name: string;
  type: QuizBodyType;
  category: 'tracked';
  sms_eligible: boolean;
};

export function trackedBodies(catalog: readonly CatalogBody[]): BodySeed[] {
  return catalog
    .filter((b) => b.category === 'tracked' && (QUIZ_BODY_TYPES as readonly string[]).includes(b.type))
    .map((b) => ({ id: b.id, name: b.name, type: b.type as QuizBodyType, category: 'tracked', sms_eligible: b.sms_eligible }));
}

export const TRACKED_BODIES: readonly BodySeed[] = trackedBodies(loadBodyCatalog());
