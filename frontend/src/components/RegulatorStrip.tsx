import type { Jurisdiction } from '../format'

/**
 * Official-name badges for the regulators behind the scored rules.
 * Logos for free-zone regulators ship in /logos/freezones (PR #2); generic
 * authorities (UAE Data Office, EDPB, CNIL) stay text-only — no assets yet.
 */
const REGULATORS: {
  name: string
  frame: string
  host: string
  href: string
  j: Jurisdiction
  logo?: string
}[] = [
  {
    name: 'UAE Data Office',
    frame: 'PDPL · Decree-Law 45/2021',
    host: 'u.ae',
    href: 'https://u.ae/en',
    j: 'uae',
  },
  {
    name: 'DIFC Commissioner of Data Protection',
    frame: 'DIFC DPL No. 5/2020',
    host: 'difc.ae',
    href: 'https://www.difc.ae/',
    j: 'difc',
    logo: '/logos/freezones/difc-white.png',
  },
  {
    name: 'ADGM Office of Data Protection',
    frame: 'ADGM DPR 2021 · s.55 fines',
    host: 'adgm.com',
    href: 'https://www.adgm.com/operating-in-adgm/office-of-data-protection',
    j: 'adgm',
    logo: '/logos/freezones/adgm-white.svg',
  },
  {
    name: 'European Data Protection Board',
    frame: 'GDPR · ePrivacy guidance',
    host: 'edpb.europa.eu',
    href: 'https://www.edpb.europa.eu/',
    j: 'eu',
  },
  {
    name: 'CNIL',
    frame: 'Cookie-consent precedent',
    host: 'cnil.fr',
    href: 'https://www.cnil.fr/en',
    j: 'eu',
  },
]

export default function RegulatorStrip({ variant }: { variant: 'intro' | 'footer' }) {
  return (
    <div className={`regs regs--${variant}`}>
      <span className="regs__label">
        <span className="uae-bar" aria-hidden />
        Regulatory frame · UAE-first
      </span>
      <ul className="regs__list">
        {REGULATORS.map((r) => (
          <li key={r.name}>
            <a
              className={`reg reg--${r.j}`}
              href={r.href}
              target="_blank"
              rel="noreferrer noopener"
              title={`${r.name} — ${r.host}`}
            >
              {r.logo && (
                <img className="reg__logo" src={r.logo} alt="" aria-hidden />
              )}
              <span className="reg__name">{r.name}</span>
              {variant === 'intro' && <span className="reg__frame">{r.frame}</span>}
              <span className="reg__host mono">{r.host}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
