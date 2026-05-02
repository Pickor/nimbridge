import Link from "next/link";
import AppHeader from "@/components/app-header";

export const metadata = {
  title: "Integritetspolicy – Nimbridge",
};

export default function IntegritetspolicyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      <AppHeader
        brand="🔭 Nimbridge"
        links={[{ kind: "link", href: "/dashboard", label: "Deals", active: false }]}
      />

      <main className="mx-auto max-w-3xl px-4 py-12 flex-1 w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Integritetspolicy</h1>
        <p className="text-neutral-500 text-sm mb-10">Senast uppdaterad: april 2026</p>

        <div className="space-y-8 text-neutral-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Personuppgiftsansvarig</h2>
            <p>
              Nimbridge är personuppgiftsansvarig för den behandling av personuppgifter som
              beskrivs i denna policy. Har du frågor är du välkommen att kontakta oss på{" "}
              <a href="mailto:gdpr@nimbridge.app" className="text-blue-400 hover:underline">
                gdpr@nimbridge.app
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Vilka uppgifter samlar vi in?</h2>
            <p className="mb-3">
              När du loggar in med Google SSO tar vi emot de uppgifter Google delar med oss:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>E-postadress</li>
              <li>Visningsnamn (om du har ett satt på ditt Google-konto)</li>
              <li>Tidpunkt för inloggning</li>
            </ul>
            <p className="mt-3">
              Vi lagrar aldrig ditt Google-lösenord – autentiseringen sköts helt av Google.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Hur används uppgifterna?</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>För att identifiera dig och ge dig tillgång till tjänsten</li>
              <li>För att spara dina favoriter och filterinställningar</li>
              <li>För att administratörer ska kunna hantera behörigheter</li>
              <li>För att logga inloggningstillfällen i säkerhetssyfte</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Vad vi inte gör</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>Vi säljer aldrig dina uppgifter till tredje part</li>
              <li>Vi använder inte dina uppgifter för reklam eller profilering</li>
              <li>Vi skickar inte marknadsföringsmail utan ditt samtycke</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Cookies</h2>
            <p>
              Vi använder en sessionscookie för att hålla dig inloggad. Cookien är nödvändig för
              tjänstens funktion och innehåller inga spårningsuppgifter. Vi använder inga
              tredjeparts­spårningscookies eller analysverktyg.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Lagring och säkerhet</h2>
            <p>
              Dina uppgifter lagras i Supabase (PostgreSQL) på servrar inom EU. All kommunikation
              sker krypterat via HTTPS/TLS. Åtkomst till databasen kräver autentiserade API-nycklar
              och begränsas via Row Level Security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Dina rättigheter (GDPR)</h2>
            <p className="mb-3">Som registrerad har du rätt att:</p>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>Begära ett utdrag av de uppgifter vi har om dig</li>
              <li>Begära rättelse av felaktiga uppgifter</li>
              <li>Begära radering av ditt konto och alla tillhörande uppgifter</li>
              <li>Invända mot behandlingen</li>
            </ul>
            <p className="mt-3">
              Kontakta oss på{" "}
              <a href="mailto:gdpr@nimbridge.app" className="text-blue-400 hover:underline">
                gdpr@nimbridge.app
              </a>{" "}
              för att utöva dina rättigheter.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Radering av konto</h2>
            <p>
              Vill du ta bort ditt konto raderar vi din profil, dina favoriter och dina
              inloggningsloggar inom 30 dagar efter begäran. Mejla oss på{" "}
              <a href="mailto:gdpr@nimbridge.app" className="text-blue-400 hover:underline">
                gdpr@nimbridge.app
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Ändringar av policyn</h2>
            <p>
              Vi kan komma att uppdatera denna policy. Vid väsentliga förändringar informeras du
              via e-post eller ett meddelande i tjänsten. Senaste uppdateringsdatum visas alltid
              överst på denna sida.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Klagomål</h2>
            <p>
              Om du anser att vi behandlar dina personuppgifter felaktigt har du rätt att lämna
              klagomål till Integritetsskyddsmyndigheten (IMY) på{" "}
              <a
                href="https://www.imy.se"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                imy.se
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
