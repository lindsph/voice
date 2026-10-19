/**
 * Keep one host-owned set of golds in step with a list the host sends, e.g.
 * WoolGrown's Meta ad copy that met its sales bar. Only golds carrying the
 * set's source are touched. A gold she dismissed stays dismissed: the host can
 * add new golds to the set but never brings one of hers back.
 */

export type GoldSetItem = { body: string; title: string };

export type ExistingGold = {
  id: string;
  body: string;
  title: string;
  source: string;
  surface: string;
  status: "active" | "dismissed";
};

export type GoldSetPlan = {
  add: GoldSetItem[];
  retitle: Array<{ id: string; title: string }>;
  dismiss: string[];
  keep: number;
};

export function planGoldSetSync(input: {
  existing: ExistingGold[];
  items: GoldSetItem[];
  source: string;
  surface: string;
}): GoldSetPlan {
  const wanted = new Map<string, GoldSetItem>();
  for (const item of input.items) {
    const body = item.body.trim();
    if (body && !wanted.has(body)) wanted.set(body, { body, title: item.title.trim() || body.slice(0, 52) });
  }
  const anyByBody = new Map(input.existing.map((gold) => [gold.body.trim(), gold]));
  const plan: GoldSetPlan = { add: [], retitle: [], dismiss: [], keep: 0 };

  for (const [body, item] of wanted) {
    const gold = anyByBody.get(body);
    if (!gold) {
      plan.add.push(item);
      continue;
    }
    // Same words already a gold (hers, or dismissed): leave it as it is.
    if (gold.source !== input.source || gold.surface !== input.surface || gold.status !== "active") continue;
    plan.keep += 1;
    if (gold.title !== item.title) plan.retitle.push({ id: gold.id, title: item.title });
  }
  for (const gold of input.existing) {
    if (gold.source !== input.source || gold.surface !== input.surface || gold.status !== "active") continue;
    if (!wanted.has(gold.body.trim())) plan.dismiss.push(gold.id);
  }
  return plan;
}
