import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDict, isLocale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { canSelfCancel, findByManageToken } from "@/lib/bookings";
import { formatDateTime, formatMoney, minutesToText } from "@/lib/time";
import { Mark } from "@/components/Logo";
import { CancelButton } from "@/components/booking/CancelButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ManagePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDict(locale);
  const settings = await getSettings();
  const b = await findByManageToken(token).catch(() => null);

  if (!b) {
    return (
      <div className="mx-auto max-w-lg px-7 py-40 text-center">
        <Mark className="mx-auto h-12 w-auto" />
        <h1 className="mt-8 font-display text-3xl font-light text-ink-800">{t.manage.notFound}</h1>
        <Link href={`/${locale}/reserver`} className="btn mt-9">{t.manage.rebook}</Link>
      </div>
    );
  }

  const cancelled = b.status === "cancelled";
  const past = b.startsAt.getTime() < Date.now();
  const statusLabel = cancelled
    ? t.manage.status.cancelled
    : past ? t.manage.status.completed : t.manage.status.confirmed;

  return (
    <div className="bg-linen-100 pt-24">
      <div className="mx-auto max-w-2xl px-7 py-16 sm:px-10 sm:py-20">
        <header className="text-center">
          <Mark className="mx-auto h-12 w-auto" />
          <h1 className="mt-7 font-display text-4xl font-light text-ink-800">{t.manage.title}</h1>
          <p className={`mt-4 inline-block border px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] ${
            cancelled ? "border-ink-300 text-ink-400" : "border-gold-400 text-gold-700"
          }`}>
            {statusLabel}
          </p>
        </header>

        <div className={`paper mt-10 p-8 sm:p-10 ${cancelled ? "opacity-60" : ""}`}>
          <dl className="divide-y divide-gold-300/40">
            <Row label={t.booking.step4.when}
              value={formatDateTime(b.startsAt, settings.timezone, locale)}
              strike={cancelled} big />
            <Row label={t.booking.step1.duration} value={minutesToText(b.durationMinutes, locale)} />
            <Row label={t.booking.step4.where} value={`${b.address}, ${b.city} ${b.postalCode}`} />
            <Row label={t.booking.step4.what} value={b.items.map((i) => `${i.label} × ${i.qty}`).join(" · ")} />
            <Row label={t.booking.step4.who} value={`${b.clientName} · ${b.clientPhone}`} />
            {b.notes && <Row label={t.booking.step1.notes} value={b.notes} />}
            <Row label={t.booking.step4.total}
              value={formatMoney(b.estimateCents, b.currency, locale)}
              hint={b.firstHourFree ? t.booking.step1.firstFreeApplied : undefined} />
            <Row label={t.booking.success.ref} value={b.ref} mono />
          </dl>
        </div>

        <div className="mt-10 text-center">
          {cancelled ? (
            <>
              <p className="text-[0.9rem] text-ink-500">{t.manage.cancelled}</p>
              <Link href={`/${locale}/reserver`} className="btn mt-7">{t.manage.rebook}</Link>
            </>
          ) : past ? (
            <Link href={`/${locale}/reserver`} className="btn">{t.manage.rebook}</Link>
          ) : canSelfCancel(b) ? (
            <CancelButton token={token} t={t} />
          ) : (
            <p className="text-[0.9rem] leading-relaxed text-ink-500">{t.manage.tooLate}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, hint, strike, big, mono }: {
  label: string; value: string; hint?: string; strike?: boolean; big?: boolean; mono?: boolean;
}) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-5">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-ink-400">{label}</dt>
      <dd className={`leading-relaxed text-ink-800 ${big ? "font-display text-xl" : "text-[0.93rem]"} ${
        strike ? "line-through opacity-60" : ""} ${mono ? "font-mono tracking-wider" : ""}`}>
        {value}
        {hint && <span className="mt-0.5 block text-[10px] uppercase tracking-[0.14em] text-gold-600">{hint}</span>}
      </dd>
    </div>
  );
}
