import Link from "next/link";
import { Mark } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 py-32 text-center">
      <Mark className="h-14 w-auto" />
      <p className="mt-8 font-display text-6xl font-light text-gold-500">404</p>
      <h1 className="mt-4 font-display text-3xl font-light text-ink-800">
        Cette page a pris le pli.
      </h1>
      <p className="mt-3 max-w-sm text-[0.92rem] font-light leading-relaxed text-ink-500">
        Elle n&apos;existe pas, ou plus. Revenons à quelque chose de bien repassé.
      </p>
      <Link href="/fr" className="btn mt-9">Retour à l&apos;accueil</Link>
    </div>
  );
}
