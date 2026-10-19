import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { amountOf, findPlan, findSubscriptionByToken } from "@/lib/subscriptions";
import { canSubscriberChange } from "@/lib/cycles";
import { rhythmPhrase, slotPhrase } from "@/lib/email";
import { formatDateTime, formatMoney, minutesToText } from "@/lib/time";
import { PHONE, PHONE_HREF } from "@/lib/brand";
import { Mark } from "@/components/Logo";
import { VisitActions } from "@/components/booking/VisitActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDict(locale).subManage.title, robots: { index: false, follow: false } };
}

/**
 * « Gérer mes visites » — le lien du courriel de confirmation.
 *
 * Chaque visite à venir s'annule ou se déplace seule, sans toucher au reste
 * de la série, jusqu'à 23 h 59 la veille. Passé ce délai, la page donne le
 * numéro de téléphone : c'est une conversation, plus un formulaire.
 */
export default async function SubscriptionPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ remplacement?: string; deplacee?: string }>;
}) {
  const { locale, token } = await params;
  const sp = await searchParams;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const m = t.subManage;
  const settings = await getSettings();
  const tz = settings.timezone;
  const full = await findSubscriptionByToken(token).catch(() => null);

  if (!full) {
    return (
      <div className="mx-auto max-w-lg px-7 py-40 text-center">
        <Mark className="mx-auto h-12 w-auto" />
        <h1 className="mt-8 font-display text-3xl font-light text-ink-800">{m.notFound}</h1>
        <Link href={`/${locale}/abonnement`} className="btn mt-9">{t.tarifs.plans.cta}</Link>
      </div>
    );
  }

  const { sub, view, visits } = full;
  const ended = sub.status === "ended";
  const plan = findPlan(sub.planKey);
  const name = plan ? (locale === "en" ? plan.en.name : plan.fr.name) : sub.planName;
  const amount = amountOf(sub);
  const kept = visits.filter((v) => v.status !== "cancelled");
  const upcoming = ahead(visits);
  const doneCount = kept.filter((v) => v.doneAt).length;

  return (
    <div className="bg-linen-100 pt-24">
      <div className="mx-auto max-w-2xl px-7 py-16 sm:px-10 sm:py-20">
        <header className="text-center">
          <Mark className="mx-auto h-12 w-auto" />
          <h1 className="mt-7 font-display text-4xl font-light text-ink-800">{m.title}</h1>
          <p className={`mt-4 inline-block border px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] ${
            ended ? "border-ink-300 text-ink-400" : "border-gold-400 text-gold-700"
          }`}>
            {ended ? m.status.ended : m.status.active}
          </p>
        </header>

        <div className="paper mt-10 p-8 sm:p-10">
          <dl className="divide-y divide-gold-300/40">
            <Line label={t.subscribe.confirm.plan} value={`${name} — ${minutesToText(sub.minutesPerVisit, locale)}`} big />
            {kept[0] && (
              <Line label={m.rhythm} value={`${slotPhrase(kept[0].startsAt, tz, locale)}, ${rhythmPhrase(sub.everyWeeks, locale)}`} />
            )}
            {!ended && (
              <Line label={m.cycleLabel}
                value={m.cycleNow.replace("{c}", String(view.currentCycle)).replace("{d}", String(view.doneInCurrent)).replace("{n}", String(sub.perCycle))} />
            )}
            <Line label={m.amount} value={formatMoney(amount.totalCents, sub.currency, locale)}
              hint={amount.travelCents > 0
                ? `${formatMoney(amount.planCents, sub.currency, locale)} + ${formatMoney(amount.travelCents, sub.currency, locale)} · ${m.payment}`
                : m.payment} />
            <Line label={t.booking.step4.where} value={`${sub.address}, ${sub.city} ${sub.postalCode}`} />
            <Line label={t.booking.success.ref} value={sub.ref} mono />
          </dl>
        </div>

        {ended ? (
          <div className="mt-10 text-center">
            <p className="text-[0.9rem] text-ink-500">{m.ended}</p>
            <Link href={`/${locale}/abonnement`} className="btn mt-7">{t.tarifs.plans.cta}</Link>
          </div>
        ) : (
          <section className="mt-12" aria-labelledby="upcoming">
            <h2 id="upcoming" className="font-display text-2xl font-light text-ink-800">{m.upcoming}</h2>
            <p className="mt-2 text-[0.84rem] font-light text-ink-500">{m.rule}</p>
            {flash(sp, m, tz, locale) && (
              <p role="status" className="mt-5 border-l-2 border-gold-400 bg-linen-50 px-4 py-3 text-[0.85rem] text-gold-700">
                {flash(sp, m, tz, locale)}
              </p>
            )}
            {doneCount > 0 && (
              <p className="mt-1 text-[0.8rem] font-light text-ink-400">
                {doneCount === 1 ? m.doneOne : m.done.replace("{n}", String(doneCount))}
              </p>
            )}
            <ul className="mt-6 space-y-3">
              {upcoming.map((v) => {
                const n = view.numbers.get(v.id);
                const cancelled = v.status === "cancelled";
                const open = !cancelled && !v.doneAt && canSubscriberChange(v.startsAt, tz);
                return (
                  <li key={v.id} className={`border border-gold-300/40 bg-linen-50 px-5 py-4 ${cancelled ? "opacity-55" : ""}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className={`font-display text-[1.1rem] text-ink-800 ${cancelled ? "line-through" : ""}`}>
                        {formatDateTime(v.startsAt, tz, locale)}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400">
                        {cancelled ? m.cancelledTag
                          : n ? m.rank.replace("{i}", String(n.index)).replace("{n}", String(sub.perCycle)).replace("{c}", String(n.cycle)) : ""}
                        {!cancelled && v.makeup ? ` · ${m.makeup}` : ""}
                      </p>
                    </div>
                    {!cancelled && (open ? (
                      <VisitActions token={token} visitId={v.id} startsAt={v.startsAt.toISOString()}
                        locale={locale} timezone={tz} t={t} />
                    ) : (
                      <p className="mt-2 text-[0.82rem] font-light leading-relaxed text-ink-500">
                        {m.tooLate}{" "}
                        <a href={PHONE_HREF} className="text-gold-700 underline decoration-gold-400 underline-offset-4">{PHONE}</a>
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** Ce qui vient d'être fait, dit en tête de liste après le rechargement. */
function flash(
  sp: { remplacement?: string; deplacee?: string },
  m: { replaced: string; replacedNone: string; moved: string },
  tz: string, locale: "fr" | "en",
): string | null {
  if (sp.remplacement) {
    const d = new Date(sp.remplacement);
    return Number.isNaN(d.getTime()) ? m.replacedNone : m.replaced.replace("{when}", formatDateTime(d, tz, locale));
  }
  return sp.deplacee ? m.moved : null;
}

/** Les visites qui ne sont pas encore terminées, annulées comprises. */
function ahead<T extends { endsAt: Date }>(visits: T[]): T[] {
  const now = Date.now();
  return visits.filter((v) => v.endsAt.getTime() > now);
}

function Line({ label, value, hint, big, mono }: { label: string; value: string; hint?: string; big?: boolean; mono?: boolean }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-5">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-400">{label}</dt>
      <dd className={`leading-relaxed text-ink-800 ${big ? "font-display text-xl" : "text-[0.93rem]"} ${mono ? "font-mono tracking-wider" : ""}`}>
        {value}
        {hint && <span className="mt-0.5 block text-[11px] text-ink-500">{hint}</span>}
      </dd>
    </div>
  );
}
