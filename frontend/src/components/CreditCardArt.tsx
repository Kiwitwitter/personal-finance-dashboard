import React, { useId, useState } from 'react';

export interface CardArtProps {
  institutionName: string;
  displayName: string;
  rawName?: string | null;
  officialName?: string | null;
  mask?: string | null;
  skin?: string | null;
  imageUrl?: string | null;
  isChargeCard?: boolean;
  compact?: boolean;
  className?: string;
}

export const CARD_SKIN_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: '✨ 自动智能匹配 (根据银行与卡种)' },
  { value: 'chase-sapphire-preferred', label: 'Chase Sapphire Preferred (璀璨蓝宝石)' },
  { value: 'chase-sapphire-reserve', label: 'Chase Sapphire Reserve (深邃曜石蓝)' },
  { value: 'chase-prime', label: 'Chase Prime Visa (亚马逊哑光黑钛)' },
  { value: 'chase-freedom', label: 'Chase Freedom / Ultimate Rewards (经典深海蓝)' },
  { value: 'chase-ink', label: 'Chase Ink Business (商务石墨灰)' },
  { value: 'amex-platinum', label: 'Amex Platinum Card® (拉丝金属白金)' },
  { value: 'amex-gold', label: 'Amex Gold Card® (香槟拉丝纯金)' },
  { value: 'amex-hilton', label: 'Amex Hilton Honors (希尔顿珍珠银蓝)' },
  { value: 'amex-bce', label: 'Amex Blue Cash Everyday® (冰晶透感蓝)' },
  { value: 'boa-atmos-ascent', label: 'BoA Atmos Rewards Ascent (极光青紫)' },
  { value: 'boa-travel-rewards', label: 'BoA Travel Rewards (环球蔚蓝)' },
  { value: 'boa-customized-cash', label: 'BoA Customized Cash (经典绯红)' },
  { value: 'bilt-palladium', label: 'Bilt Palladium Card (重金属拉丝钯金)' },
  { value: 'generic-slate', label: 'Minimal Titanium (极简深空钛灰)' },
];

export function resolveSkinClient(props: {
  skin?: string | null;
  institutionName: string;
  displayName: string;
  rawName?: string | null;
  officialName?: string | null;
}): string {
  if (props.skin && props.skin !== 'auto') {
    return props.skin;
  }
  const hay = [
    props.institutionName,
    props.displayName,
    props.rawName ?? '',
    props.officialName ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (hay.includes('american express') || hay.includes('amex')) {
    if (hay.includes('platinum')) return 'amex-platinum';
    if (hay.includes('gold')) return 'amex-gold';
    if (hay.includes('hilton')) return 'amex-hilton';
    if (hay.includes('blue cash') || hay.includes('bce')) return 'amex-bce';
    return 'amex-platinum';
  }
  if (hay.includes('bilt')) {
    return 'bilt-palladium';
  }
  if (hay.includes('bank of america') || hay.includes('atmos')) {
    if (hay.includes('atmos') || hay.includes('ascent') || hay.includes('alaska')) {
      return 'boa-atmos-ascent';
    }
    if (hay.includes('customized') || hay.includes('cash rewards')) {
      return 'boa-customized-cash';
    }
    return 'boa-travel-rewards';
  }
  if (hay.includes('chase')) {
    if (hay.includes('prime') || hay.includes('amazon')) return 'chase-prime';
    if (hay.includes('reserve') || hay.includes('csr')) return 'chase-sapphire-reserve';
    if (hay.includes('preferred') || hay.includes('csp')) return 'chase-sapphire-preferred';
    if (hay.includes('ink')) return 'chase-ink';
    return 'chase-freedom';
  }
  return 'generic-slate';
}

interface Palette {
  stops: [string, string, string];
  textPrimary: string;
  textSubtle: string;
  chipFill: string;
  chipStroke: string;
  network: 'visa' | 'visa-signature' | 'visa-infinite' | 'amex' | 'mastercard';
  seriesLabel: string;
  issuerHeader: string;
  lightCard?: boolean;
}

const SKIN_PALETTES: Record<string, Palette> = {
  'amex-platinum': {
    stops: ['#e5e9f0', '#b8c2cc', '#d8dee9'],
    textPrimary: '#0f172a',
    textSubtle: '#334155',
    chipFill: '#cbd5e1',
    chipStroke: '#64748b',
    network: 'amex',
    seriesLabel: 'THE PLATINUM CARD®',
    issuerHeader: 'AMERICAN EXPRESS',
    lightCard: true,
  },
  'amex-gold': {
    stops: ['#fef08a', '#d4af37', '#a16207'],
    textPrimary: '#1c1917',
    textSubtle: '#44403c',
    chipFill: '#fde047',
    chipStroke: '#854d0e',
    network: 'amex',
    seriesLabel: 'GOLD CARD®',
    issuerHeader: 'AMERICAN EXPRESS',
    lightCard: true,
  },
  'amex-hilton': {
    stops: ['#f8fafc', '#dbeafe', '#bfdbfe'],
    textPrimary: '#0f172a',
    textSubtle: '#1e3a8a',
    chipFill: '#e2e8f0',
    chipStroke: '#64748b',
    network: 'amex',
    seriesLabel: 'HILTON HONORS',
    issuerHeader: 'AMERICAN EXPRESS',
    lightCard: true,
  },
  'amex-bce': {
    stops: ['#0369a1', '#0ea5e9', '#38bdf8'],
    textPrimary: '#f8fafc',
    textSubtle: '#e0f2fe',
    chipFill: '#e2e8f0',
    chipStroke: '#94a3b8',
    network: 'amex',
    seriesLabel: 'BLUE CASH EVERYDAY®',
    issuerHeader: 'AMERICAN EXPRESS',
  },
  'chase-sapphire-reserve': {
    stops: ['#040b1d', '#0f2557', '#1e3a8a'],
    textPrimary: '#f8fafc',
    textSubtle: '#93c5fd',
    chipFill: '#cbd5e1',
    chipStroke: '#64748b',
    network: 'visa-infinite',
    seriesLabel: 'SAPPHIRE RESERVE®',
    issuerHeader: 'CHASE',
  },
  'chase-sapphire-preferred': {
    stops: ['#0b2154', '#1d4ed8', '#0f347c'],
    textPrimary: '#f8fafc',
    textSubtle: '#bfdbfe',
    chipFill: '#e2e8f0',
    chipStroke: '#94a3b8',
    network: 'visa',
    seriesLabel: 'SAPPHIRE PREFERRED®',
    issuerHeader: 'CHASE',
  },
  'chase-prime': {
    stops: ['#111827', '#1f2937', '#090d16'],
    textPrimary: '#f8fafc',
    textSubtle: '#9ca3af',
    chipFill: '#d1d5db',
    chipStroke: '#6b7280',
    network: 'visa-signature',
    seriesLabel: 'PRIME VISA',
    issuerHeader: 'CHASE',
  },
  'chase-freedom': {
    stops: ['#0a193c', '#1e40af', '#0284c7'],
    textPrimary: '#f8fafc',
    textSubtle: '#bae6fd',
    chipFill: '#fde68a',
    chipStroke: '#b45309',
    network: 'visa',
    seriesLabel: 'ULTIMATE REWARDS®',
    issuerHeader: 'CHASE',
  },
  'chase-ink': {
    stops: ['#0f172a', '#1e293b', '#334155'],
    textPrimary: '#f8fafc',
    textSubtle: '#cbd5e1',
    chipFill: '#e2e8f0',
    chipStroke: '#64748b',
    network: 'visa',
    seriesLabel: 'INK BUSINESS®',
    issuerHeader: 'CHASE',
  },
  'boa-atmos-ascent': {
    stops: ['#07192f', '#0d9488', '#4f46e5'],
    textPrimary: '#f8fafc',
    textSubtle: '#99f6e4',
    chipFill: '#e2e8f0',
    chipStroke: '#64748b',
    network: 'visa-signature',
    seriesLabel: 'ATMOS™ REWARDS ASCENT',
    issuerHeader: 'BANK OF AMERICA',
  },
  'boa-travel-rewards': {
    stops: ['#08245c', '#1d4ed8', '#0369a1'],
    textPrimary: '#f8fafc',
    textSubtle: '#bfdbfe',
    chipFill: '#fde68a',
    chipStroke: '#b45309',
    network: 'visa-signature',
    seriesLabel: 'TRAVEL REWARDS',
    issuerHeader: 'BANK OF AMERICA',
  },
  'boa-customized-cash': {
    stops: ['#691018', '#dc2626', '#991b1b'],
    textPrimary: '#f8fafc',
    textSubtle: '#fecaca',
    chipFill: '#fde68a',
    chipStroke: '#b45309',
    network: 'visa',
    seriesLabel: 'CUSTOMIZED CASH',
    issuerHeader: 'BANK OF AMERICA',
  },
  'bilt-palladium': {
    stops: ['#18181b', '#2d2d34', '#09090b'],
    textPrimary: '#f4f4f5',
    textSubtle: '#a1a1aa',
    chipFill: '#d4d4d8',
    chipStroke: '#52525b',
    network: 'mastercard',
    seriesLabel: 'PALLADIUM',
    issuerHeader: 'BILT',
  },
  'generic-slate': {
    stops: ['#0f172a', '#1e293b', '#090d16'],
    textPrimary: '#f8fafc',
    textSubtle: '#94a3b8',
    chipFill: '#e2e8f0',
    chipStroke: '#64748b',
    network: 'visa',
    seriesLabel: 'CREDIT CARD',
    issuerHeader: 'CARD',
  },
};

export function CreditCardArt({
  institutionName,
  displayName,
  rawName,
  officialName,
  mask,
  skin,
  imageUrl,
  compact = false,
  className = '',
}: CardArtProps) {
  const uid = useId().replace(/:/g, '');
  const [imgFailed, setImgFailed] = useState(false);

  const trimmedUrl = (imageUrl ?? '').trim();
  if (trimmedUrl && !imgFailed) {
    return (
      <img
        src={trimmedUrl}
        alt=""
        loading="lazy"
        onError={() => setImgFailed(true)}
        className={
          compact
            ? `aspect-[1.586/1] rounded-md object-cover shadow-sm ${className}`
            : `cc-art-img ${className}`
        }
      />
    );
  }

  const skinKey = resolveSkinClient({
    skin,
    institutionName,
    displayName,
    rawName,
    officialName,
  });
  const p = SKIN_PALETTES[skinKey] ?? SKIN_PALETTES['generic-slate'];
  const bgId = `cc-bg-${uid}`;
  const shineId = `cc-shine-${uid}`;
  const maskDigits = mask ? `•••• ${mask}` : '•••• ••••';

  return (
    <svg
      viewBox="0 0 380 240"
      aria-hidden="true"
      className={
        compact
          ? `aspect-[1.586/1] rounded-md shadow-sm select-none ${className}`
          : `cc-art-svg select-none ${className}`
      }
    >
      <defs>
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={p.stops[0]} />
          <stop offset="52%" stopColor={p.stops[1]} />
          <stop offset="100%" stopColor={p.stops[2]} />
        </linearGradient>
        <linearGradient id={shineId} x1="0%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={p.lightCard ? '0.45' : '0.16'} />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#000000" stopOpacity={p.lightCard ? '0.08' : '0.28'} />
        </linearGradient>
      </defs>

      {/* Card Base */}
      <rect width="380" height="240" rx="18" fill={`url(#${bgId})`} />

      {/* Card-Specific Signature Artwork Motifs */}
      {(skinKey === 'amex-platinum' || skinKey === 'amex-gold') && (
        <g opacity="0.34">
          <rect
            x="12"
            y="12"
            width="356"
            height="216"
            rx="11"
            fill="none"
            stroke={p.textPrimary}
            strokeWidth="1.5"
          />
          <rect
            x="16"
            y="16"
            width="348"
            height="208"
            rx="8"
            fill="none"
            stroke={p.textPrimary}
            strokeWidth="0.6"
            strokeDasharray="3 2"
          />
          {/* Centurion Medallion Geometric Ring */}
          <ellipse
            cx="190"
            cy="122"
            rx="44"
            ry="52"
            fill="none"
            stroke={p.textPrimary}
            strokeWidth="1.4"
          />
          <ellipse
            cx="190"
            cy="122"
            rx="36"
            ry="44"
            fill="none"
            stroke={p.textPrimary}
            strokeWidth="0.7"
          />
          <path
            d="M174 112 C180 95, 200 95, 206 112 L202 138 C194 146, 186 146, 178 138 Z"
            fill="none"
            stroke={p.textPrimary}
            strokeWidth="1.2"
          />
        </g>
      )}

      {skinKey === 'amex-hilton' && (
        <g>
          <path
            d="M-10 175 C95 125, 220 220, 395 135 L395 245 L-10 245 Z"
            fill="#1d4ed8"
            opacity="0.22"
          />
          <path
            d="M-10 198 C120 155, 250 230, 395 168 L395 245 L-10 245 Z"
            fill="#1e40af"
            opacity="0.3"
          />
        </g>
      )}

      {skinKey === 'amex-bce' && (
        <g opacity="0.28">
          <rect
            x="130"
            y="58"
            width="120"
            height="120"
            rx="20"
            transform="rotate(12 190 118)"
            fill="#bae6fd"
          />
          <rect
            x="148"
            y="76"
            width="84"
            height="84"
            rx="14"
            transform="rotate(-8 190 118)"
            fill="#e0f2fe"
          />
        </g>
      )}

      {(skinKey === 'chase-sapphire-preferred' || skinKey === 'chase-sapphire-reserve') && (
        <g opacity={skinKey === 'chase-sapphire-reserve' ? '0.32' : '0.38'}>
          <polygon points="210,0 380,0 380,150" fill="#38bdf8" opacity="0.35" />
          <polygon points="140,240 380,75 380,240" fill="#60a5fa" opacity="0.25" />
          <polygon points="255,0 380,195 190,240" fill="#1e40af" opacity="0.45" />
          <line x1="120" y1="0" x2="340" y2="240" stroke="#93c5fd" strokeWidth="1" opacity="0.5" />
          <line x1="250" y1="0" x2="80" y2="240" stroke="#60a5fa" strokeWidth="0.8" opacity="0.4" />
        </g>
      )}

      {skinKey === 'chase-prime' && (
        <g>
          {/* Prime Cyan Smile Arc */}
          <path
            d="M 115 164 Q 215 212 318 156"
            fill="none"
            stroke="#00a8e1"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <path
            d="M 305 152 L 322 154 L 315 170"
            fill="none"
            stroke="#00a8e1"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {skinKey === 'chase-freedom' && (
        <g opacity="0.3">
          <path d="M-10 190 Q 180 120 390 155 L 390 245 L -10 245 Z" fill="#38bdf8" />
          <path d="M-10 205 Q 190 150 390 175" fill="none" stroke="#e0f2fe" strokeWidth="2" />
        </g>
      )}

      {skinKey === 'boa-atmos-ascent' && (
        <g opacity="0.48">
          <path
            d="M -10 155 C 85 85, 195 195, 390 90 L 390 245 L -10 245 Z"
            fill="#2dd4bf"
            opacity="0.35"
          />
          <path
            d="M -10 185 C 125 130, 235 210, 390 135 L 390 245 L -10 245 Z"
            fill="#a855f7"
            opacity="0.38"
          />
        </g>
      )}

      {(skinKey === 'boa-travel-rewards' || skinKey === 'boa-customized-cash') && (
        <g opacity="0.22" stroke="#ffffff" fill="none">
          <circle cx="315" cy="120" r="95" strokeWidth="1.2" />
          <circle cx="315" cy="120" r="68" strokeWidth="0.9" />
          <ellipse cx="315" cy="120" rx="40" ry="95" strokeWidth="0.9" />
        </g>
      )}

      {skinKey === 'bilt-palladium' && (
        <g opacity="0.24">
          <line x1="0" y1="54" x2="380" y2="54" stroke="#71717a" strokeWidth="0.7" />
          <line x1="255" y1="0" x2="255" y2="240" stroke="#52525b" strokeWidth="0.7" />
        </g>
      )}

      {/* Metallic Sheen Overlay */}
      <rect width="380" height="240" rx="18" fill={`url(#${shineId})`} />

      {/* Top Row: Issuer Brand + Series Subtitle */}
      {skinKey === 'bilt-palladium' ? (
        <text
          x="28"
          y="44"
          fill={p.textPrimary}
          fontSize="24"
          fontWeight="800"
          letterSpacing="5"
          fontFamily="Inter, -apple-system, sans-serif"
        >
          BILT
        </text>
      ) : (
        <text
          x="28"
          y="40"
          fill={p.textPrimary}
          fontSize="13"
          fontWeight="700"
          letterSpacing="2.2"
          fontFamily="Inter, -apple-system, sans-serif"
        >
          {p.issuerHeader}
        </text>
      )}

      {/* Chase Octagon Emblem on top-right for Chase cards */}
      {p.issuerHeader === 'CHASE' && (
        <g transform="translate(330, 22) scale(0.9)">
          <polygon
            points="8,0 18,0 26,8 26,18 18,26 8,26 0,18 0,8"
            fill="none"
            stroke={p.textPrimary}
            strokeWidth="2.4"
          />
          <polygon points="10,7 19,7 19,16 10,16" fill={p.textPrimary} opacity="0.85" />
        </g>
      )}

      {/* Bank of America Flag Stripes on top-right */}
      {p.issuerHeader === 'BANK OF AMERICA' && (
        <g transform="translate(324, 25)">
          <path d="M0 6 L12 2 L26 6" stroke="#ef4444" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M2 12 L14 8 L28 12" stroke="#ef4444" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M-2 12 L10 16 L22 12" stroke="#60a5fa" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </g>
      )}

      {/* EMV Metallic Chip + Contactless Wave */}
      <g transform="translate(28, 84)">
        <rect
          width="46"
          height="35"
          rx="6"
          fill={p.chipFill}
          stroke={p.chipStroke}
          strokeWidth="1.2"
        />
        <line x1="15" y1="0" x2="15" y2="35" stroke={p.chipStroke} strokeWidth="0.9" />
        <line x1="31" y1="0" x2="31" y2="35" stroke={p.chipStroke} strokeWidth="0.9" />
        <line x1="0" y1="12" x2="15" y2="12" stroke={p.chipStroke} strokeWidth="0.9" />
        <line x1="31" y1="12" x2="46" y2="12" stroke={p.chipStroke} strokeWidth="0.9" />
        <line x1="0" y1="23" x2="15" y2="23" stroke={p.chipStroke} strokeWidth="0.9" />
        <line x1="31" y1="23" x2="46" y2="23" stroke={p.chipStroke} strokeWidth="0.9" />
        {/* Contactless NFC Waves */}
        <g transform="translate(56, 8)" stroke={p.textSubtle} strokeWidth="1.7" fill="none" strokeLinecap="round">
          <path d="M 2 6 A 6 6 0 0 1 2 14" />
          <path d="M 6 3 A 10 10 0 0 1 6 17" />
          <path d="M 10 0 A 14 14 0 0 1 10 20" />
        </g>
      </g>

      {/* Series Label + Last 4 Digits */}
      {!compact && (
        <text
          x="28"
          y="168"
          fill={p.textSubtle}
          fontSize="10.5"
          fontWeight="600"
          letterSpacing="1.8"
          fontFamily="Inter, -apple-system, sans-serif"
        >
          {p.seriesLabel}
        </text>
      )}

      <text
        x="28"
        y={compact ? '198' : '204'}
        fill={p.textPrimary}
        fontSize={compact ? '22' : '17'}
        fontWeight="700"
        letterSpacing="2.4"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {maskDigits}
      </text>

      {/* Bottom-Right Network Mark */}
      {p.network === 'mastercard' && (
        <g transform="translate(306, 182)">
          <circle cx="16" cy="16" r="14" fill="#eb001b" opacity="0.92" />
          <circle cx="32" cy="16" r="14" fill="#f79e1b" opacity="0.88" />
        </g>
      )}

      {p.network === 'amex' && (
        <g transform="translate(304, 180)">
          <rect
            width="48"
            height="32"
            rx="5"
            fill="#006fcf"
            stroke="#ffffff"
            strokeWidth="1.2"
          />
          <text
            x="24"
            y="20"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="11.5"
            fontWeight="800"
            letterSpacing="0.8"
            fontFamily="Inter, -apple-system, sans-serif"
          >
            AMEX
          </text>
        </g>
      )}

      {(p.network === 'visa' ||
        p.network === 'visa-signature' ||
        p.network === 'visa-infinite') && (
        <g transform="translate(292, 188)">
          <text
            x="60"
            y="14"
            textAnchor="end"
            fill={p.textPrimary}
            fontSize="20"
            fontStyle="italic"
            fontWeight="900"
            letterSpacing="1"
            fontFamily="Inter, -apple-system, sans-serif"
          >
            VISA
          </text>
          {!compact && p.network !== 'visa' && (
            <text
              x="60"
              y="25"
              textAnchor="end"
              fill={p.textSubtle}
              fontSize="7.5"
              fontWeight="600"
              letterSpacing="1.1"
              fontFamily="Inter, -apple-system, sans-serif"
            >
              {p.network === 'visa-infinite' ? 'INFINITE' : 'SIGNATURE'}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

export function BankBrandMark({ institution }: { institution: string }) {
  const inst = institution.toLowerCase();

  if (inst.includes('chase')) {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl shadow-sm">
        <rect width="36" height="36" rx="10" fill="#1155cc" />
        <polygon
          points="14,7 22,7 29,14 29,22 22,29 14,29 7,22 7,14"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.6"
        />
        <circle cx="18" cy="18" r="3.2" fill="#ffffff" />
      </svg>
    );
  }

  if (inst.includes('american express') || inst.includes('amex')) {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl shadow-sm">
        <rect width="36" height="36" rx="10" fill="#006fcf" />
        <rect
          x="3.5"
          y="3.5"
          width="29"
          height="29"
          rx="7"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
        <text
          x="18"
          y="22"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="10"
          fontWeight="900"
          letterSpacing="0.6"
          fontFamily="Inter, -apple-system, sans-serif"
        >
          AMEX
        </text>
      </svg>
    );
  }

  if (inst.includes('bank of america')) {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl shadow-sm">
        <rect width="36" height="36" rx="10" fill="#0c2340" />
        <path d="M8 14 L18 10 L28 14" stroke="#e31837" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M8 20 L18 16 L28 20" stroke="#e31837" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M8 24 L18 27 L28 24" stroke="#38bdf8" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  if (inst.includes('bilt')) {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl shadow-sm">
        <rect width="36" height="36" rx="10" fill="#18181b" stroke="#3f3f46" strokeWidth="1.2" />
        <text
          x="18"
          y="22"
          textAnchor="middle"
          fill="#f4f4f5"
          fontSize="10.5"
          fontWeight="800"
          letterSpacing="2"
          fontFamily="Inter, -apple-system, sans-serif"
        >
          BILT
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-xl shadow-sm">
      <rect width="36" height="36" rx="10" fill="#1e293b" />
      <text
        x="18"
        y="22"
        textAnchor="middle"
        fill="#f8fafc"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, -apple-system, sans-serif"
      >
        {institution.slice(0, 2).toUpperCase()}
      </text>
    </svg>
  );
}
