import { BRAND_COLORS } from './tokens';

export function BrandMark({ size = 22 }: { size?: number }) {
  const h = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* top-left: blue arrow */}
      <rect x="0" y="0" width={h} height={h} rx="2" fill={BRAND_COLORS.blue} />
      <path d={`M${h*0.3},${h*0.7} L${h*0.5},${h*0.3} L${h*0.7},${h*0.7}`} stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* top-right: green circle */}
      <rect x={h} y="0" width={h} height={h} rx="2" fill={BRAND_COLORS.green} />
      <circle cx={h*1.5} cy={h*0.5} r={h*0.25} stroke="#1a1a2e" strokeWidth="1.2" fill="none" />
      {/* bottom-left: pink X */}
      <rect x="0" y={h} width={h} height={h} rx="2" fill={BRAND_COLORS.pink} />
      <path d={`M${h*0.3},${h*1.3} L${h*0.7},${h*1.7} M${h*0.7},${h*1.3} L${h*0.3},${h*1.7}`} stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      {/* bottom-right: light square */}
      <rect x={h} y={h} width={h} height={h} rx="2" fill={BRAND_COLORS.light} />
      <rect x={h*1.25} y={h*1.25} width={h*0.5} height={h*0.5} rx="1" stroke="#1a1a2e" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
