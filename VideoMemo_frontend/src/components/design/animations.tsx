import { FC } from 'react'
import { Check, Loader2, Sparkles, AudioWaveform } from 'lucide-react'

export const WaveBars: FC<{ n?: number; w?: number; h?: number; gap?: number; color?: string }> = ({
  n = 5,
  w = 4,
  h = 22,
  gap = 3,
  color = 'var(--vm-primary)',
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap, height: h }}>
    {Array.from({ length: n }).map((_, i) => (
      <span
        key={i}
        style={{
          width: w,
          height: h,
          borderRadius: 999,
          background: color,
          display: 'block',
          transformOrigin: 'center',
          animation: `vm-wave ${0.9 + (i % 3) * 0.18}s ease-in-out infinite`,
          animationDelay: `${i * 0.11}s`,
        }}
      />
    ))}
  </div>
)

export const Spinner: FC<{ size?: number }> = ({ size = 17 }) => (
  <span className="vm-spin" style={{ display: 'grid' }}>
    <Loader2 size={size} />
  </span>
)

const Stage: FC<{ lit: boolean; active: boolean; children: React.ReactNode }> = ({ lit, active, children }) => (
  <div
    style={{
      padding: 8,
      borderRadius: 16,
      background: active ? 'var(--vm-primary-soft)' : 'transparent',
      transition: 'background .4s',
      animation: active ? 'vm-breathe 2s ease-in-out infinite' : 'none',
      opacity: lit ? 1 : 0.45,
      position: 'relative',
      zIndex: 1,
    }}
  >
    {children}
  </div>
)

const Connector: FC<{ active: boolean }> = ({ active }) => (
  <svg width="44" height="20" viewBox="0 0 44 20" style={{ flexShrink: 0 }}>
    <line
      x1="2"
      y1="10"
      x2="42"
      y2="10"
      stroke={active ? 'var(--vm-primary)' : 'var(--vm-surface-3)'}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeDasharray="6 6"
      style={{ animation: active ? 'vm-dash .8s linear infinite' : 'none' }}
    />
    <path
      d="M36 5 L42 10 L36 15"
      fill="none"
      stroke={active ? 'var(--vm-primary)' : 'var(--vm-surface-3)'}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * stepIndex: 0 parse, 1 download, 2 transcribe, 3 summarize, 4 done
 */
export const GenHero: FC<{ stepIndex: number }> = ({ stepIndex }) => {
  const litVideo = stepIndex >= 0
  const litWave = stepIndex >= 1
  const litNote = stepIndex >= 3
  const done = stepIndex >= 4
  return (
    <div
      style={{
        position: 'relative',
        height: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          style={{
            position: 'absolute',
            bottom: 40,
            left: `${30 + i * 11}%`,
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'var(--vm-accent)',
            opacity: 0,
            animation: `vm-rise ${2.2 + i * 0.3}s ease-in infinite`,
            animationDelay: `${i * 0.45}s`,
          }}
        />
      ))}

      <Stage lit={litVideo} active={stepIndex <= 1}>
        <div
          style={{
            width: 78,
            height: 52,
            borderRadius: 10,
            background: 'var(--vm-surface-2)',
            border: '1px solid var(--vm-border-strong)',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '13px solid var(--vm-primary)',
              borderTop: '8px solid transparent',
              borderBottom: '8px solid transparent',
              marginLeft: 3,
            }}
          />
          {stepIndex <= 1 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: 22,
                background:
                  'linear-gradient(90deg,transparent,color-mix(in srgb,var(--vm-primary) 22%,transparent),transparent)',
                animation: 'vm-scanmove 1.8s linear infinite',
              }}
            />
          )}
        </div>
      </Stage>

      <Connector active={stepIndex >= 1} />

      <Stage lit={litWave} active={stepIndex === 1 || stepIndex === 2}>
        <div
          style={{
            width: 78,
            height: 52,
            borderRadius: 10,
            background: 'var(--vm-surface)',
            border: '1px solid var(--vm-border-strong)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {litWave ? (
            <WaveBars n={6} h={20} color={'var(--vm-primary)'} />
          ) : (
            <div style={{ color: 'var(--vm-faint)' }}>
              <AudioWaveform size={22} />
            </div>
          )}
        </div>
      </Stage>

      <Connector active={stepIndex >= 3} />

      <Stage lit={litNote} active={stepIndex === 3 || done}>
        <div
          style={{
            width: 56,
            height: 64,
            borderRadius: 9,
            background: 'var(--vm-surface)',
            border: '1px solid var(--vm-border-strong)',
            padding: '9px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            position: 'relative',
          }}
        >
          {[78, 96, 64, 88].map((wpc, i) => (
            <span
              key={i}
              style={{
                height: 4,
                borderRadius: 2,
                background: litNote ? 'var(--vm-primary)' : 'var(--vm-surface-3)',
                width: wpc + '%',
                transformOrigin: 'left',
                opacity: litNote ? 1 : 0.6,
                animation: litNote ? `vm-drawline .5s ease ${i * 0.12}s both` : 'none',
              }}
            />
          ))}
          {done && (
            <div
              style={{
                position: 'absolute',
                right: -8,
                bottom: -8,
                width: 26,
                height: 26,
                borderRadius: 999,
                background: 'var(--vm-ok)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                boxShadow: 'var(--vm-shadow-sm)',
                animation: 'vm-breathe 1.6s ease-in-out infinite',
              }}
            >
              <Check size={15} strokeWidth={3} />
            </div>
          )}
        </div>
      </Stage>
    </div>
  )
}

export const EmptyTasksArt: FC = () => (
  <div style={{ position: 'relative', width: 240, height: 200, margin: '0 auto' }}>
    <div
      style={{
        position: 'absolute',
        inset: '24px 40px',
        background: 'var(--vm-primary-soft)',
        borderRadius: '50%',
        filter: 'blur(28px)',
        opacity: 0.7,
      }}
    />

    <svg viewBox="0 0 240 200" style={{ position: 'absolute', inset: 0 }}>
      <ellipse
        cx={120}
        cy={108}
        rx={92}
        ry={58}
        fill="none"
        stroke="var(--vm-border-strong)"
        strokeWidth={1.5}
        strokeDasharray="3 7"
        opacity={0.7}
      />
    </svg>

    <div
      style={{
        position: 'absolute',
        left: 86,
        top: 64,
        width: 68,
        height: 82,
        borderRadius: 14,
        background: 'var(--vm-surface)',
        border: '1px solid var(--vm-border)',
        boxShadow: 'var(--vm-shadow-md)',
        padding: '14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        animation: 'vm-driftC 4s ease-in-out infinite',
      }}
    >
      {[90, 70, 96, 60].map((w, i) => (
        <span
          key={i}
          style={{
            height: 5,
            borderRadius: 3,
            width: w + '%',
            background: i === 0 ? 'var(--vm-primary)' : 'var(--vm-surface-3)',
          }}
        />
      ))}
    </div>

    <div
      style={{
        position: 'absolute',
        left: 18,
        top: 36,
        width: 54,
        height: 38,
        borderRadius: 10,
        background: 'var(--vm-surface)',
        border: '1px solid var(--vm-border)',
        boxShadow: 'var(--vm-shadow-sm)',
        display: 'grid',
        placeItems: 'center',
        animation: 'vm-driftA 5s ease-in-out infinite',
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '11px solid var(--vm-primary)',
          borderTop: '7px solid transparent',
          borderBottom: '7px solid transparent',
          marginLeft: 3,
        }}
      />
    </div>

    <div
      style={{
        position: 'absolute',
        right: 16,
        bottom: 30,
        width: 56,
        height: 38,
        borderRadius: 10,
        background: 'var(--vm-surface)',
        border: '1px solid var(--vm-border)',
        boxShadow: 'var(--vm-shadow-sm)',
        display: 'grid',
        placeItems: 'center',
        animation: 'vm-driftB 4.4s ease-in-out infinite',
      }}
    >
      <WaveBars n={5} h={16} color="var(--vm-accent)" />
    </div>

    <span
      style={{
        position: 'absolute',
        right: 40,
        top: 30,
        color: 'var(--vm-accent)',
        animation: 'vm-twinkle 2.2s ease-in-out infinite',
      }}
    >
      <Sparkles size={18} />
    </span>
    <span
      style={{
        position: 'absolute',
        left: 40,
        bottom: 36,
        color: 'var(--vm-primary)',
        animation: 'vm-twinkle 2.6s ease-in-out infinite',
        animationDelay: '.6s',
      }}
    >
      <Sparkles size={13} />
    </span>
  </div>
)
