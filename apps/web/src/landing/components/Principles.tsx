
export function Principles() {
    return (
        <section id="about" class="principles-section">
            <div class="container">
                <div class="principles-header">
                    <span class="section-badge">Våra värderingar</span>
                    <h2 class="principles-title">Byggt på transparens</h2>
                    <p class="principles-subtitle">
                        Vi tror på AI som är öppen, säker och respekterar din integritet
                    </p>
                </div>

                <div class="principles-grid">
                    <div class="principle-card">
                        <div class="principle-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <h3>Transparent AI</h3>
                        <p>
                            Vi förklarar hur vår AI fungerar och vilka beslut den tar.
                            Ingen svart låda.
                        </p>
                        <a href="/manifest" class="principle-link">
                            Läs vårt AI-manifest
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </a>
                    </div>

                    <div class="principle-card">
                        <div class="principle-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0110 0v4" />
                            </svg>
                        </div>
                        <h3>Din data, ditt val</h3>
                        <p>
                            GDPR-compliant från dag ett. Svenska servrar.
                            Du äger alltid din data.
                        </p>
                        <a href="/privacy" class="principle-link">
                            Integritetspolicy
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </a>
                    </div>

                    <div class="principle-card">
                        <div class="principle-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                        </div>
                        <h3>Säkerhet först</h3>
                        <p>
                            Enterprise-grade kryptering. Säkerhetskopiering.
                            SOC 2-compliant infrastruktur.
                        </p>
                        <a href="/terms" class="principle-link">
                            Användarvillkor
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
