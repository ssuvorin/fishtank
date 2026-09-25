import type { Jurisdiction } from '../format'

/**
 * Official-name text badges for the regulators behind the scored rules.
 * Text only — deliberately no seals or logos (we are not affiliated).
 */
const REGULATORS: { name: string; frame: string; host: string; href: string; j: Jurisdiction }[] = [
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
