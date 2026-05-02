import Link from "next/link";
import AppHeader from "@/components/app-header";

export const metadata = {
  title: "Användarvillkor – Nimbridge",
};

export default function VillkorPage() {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      <AppHeader
        brand="🔭 Nimbridge"
        links={[{ kind: "link", href: "/dashboard", label: "Deals", active: false }]}
      />

      <main className="mx-auto max-w-3xl px-4 py-12 flex-1 w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Användarvillkor</h1>
        <p className="text-neutral-500 text-sm mb-10">Senast uppdaterad: april 2026</p>

        <div className="space-y-8 text-neutral-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Om tjänsten</h2>
            <p>
              Nimbridge är ett privat verktyg för pris-spårning. Tillgång beviljas
              på inbjudan och efter godkännande av en administratör.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Konton och åtkomst</h2>
            <p>
              Du loggar in med ditt Google-konto. Det är inte tillåtet att dela dina
              inloggnings­uppgifter eller ge andra tillgång till ditt konto. Vi förbehåller oss
              rätten att avsluta konton som missbrukas eller används i strid med dessa villkor.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Tillåten användning</h2>
            <p className="mb-3">Du får använda Nimbridge för att:</p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>Söka efter och bevaka auktioner</li>
              <li>Jämföra priser och värdera objekt</li>
              <li>Spara favoriter och filtrera resultat</li>
            </ul>
            <p className="mt-3 mb-3">Du får inte:</p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>Automatisera förfrågningar mot tjänsten (scraping, bots)</li>
              <li>Försöka komma åt data eller funktioner du inte har behörighet till</li>
              <li>Använda tjänsten i kommersiellt syfte utan skriftligt tillstånd</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Datakällor</h2>
            <p>
              Vi lämnar inga garantier för att informationen är fullständig, korrekt eller
              aktuell. Använd alltid tjänsten som ett komplement – verifiera alltid priser
              direkt hos respektive källa.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Immaterialrätt</h2>
            <p>
              Allt innehåll som vi själva skapat – design, kod och texter – tillhör Nimbridge.
              Auktionsdata tillhör respektive rättighets­havare. Du får inte kopiera, distribuera
              eller skapa härledda verk baserade på tjänstens innehåll utan skriftligt tillstånd.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Ansvarsbegränsning</h2>
            <p>
              Nimbridge tillhandahålls i befintligt skick utan några garantier. Vi ansvarar inte
              för ekonomiska beslut du fattar baserat på information i tjänsten. Prisinformation
              kan vara fördröjd, ofullständig eller felaktig. Du använder tjänsten på eget ansvar.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Ändringar av villkoren</h2>
            <p>
              Vi kan uppdatera dessa villkor. Vid väsentliga förändringar meddelar vi dig via
              e-post eller ett meddelande i tjänsten. Fortsatt användning av tjänsten efter att
              ändringar trätt i kraft innebär att du accepterar de nya villkoren.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Tillämplig lag</h2>
            <p>
              Dessa villkor regleras av svensk rätt. Tvister ska i första hand lösas i godo.
              Om det inte lyckas avgörs tvisten av svensk allmän domstol.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Kontakt</h2>
            <p>
              Frågor om dessa villkor skickas till{" "}
              <a href="mailto:hej@nimbridge.app" className="text-blue-400 hover:underline">
                hej@nimbridge.app
              </a>.
            </p>
          </section>

        </div>

        <div className="mt-12">
          <Link href="/" className="text-neutral-500 hover:text-white text-sm transition-colors">
            ← Tillbaka till startsidan
          </Link>
        </div>
      </main>
    </div>
  );
}
