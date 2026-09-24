import { View, type ViewProps } from 'react-native';

type Props = ViewProps & {
  /** Kad hijau pekat untuk ringkasan utama. */
  tone?: 'surface' | 'primary';
  className?: string;
};

/**
 * Kad asas: sudut bulat besar, padding lapang, bayang sangat lembut.
 * Satu maklumat setiap kad — jangan padatkan.
 */
export function Card({ tone = 'surface', className = '', children, ...rest }: Props) {
  const toneClass = tone === 'primary' ? 'bg-primary' : 'bg-surface border border-line';

  return (
    <View
      className={`rounded-card p-card ${toneClass} ${className}`}
      style={{
        shadowColor: '#0F5132',
        shadowOpacity: tone === 'primary' ? 0.18 : 0.05,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: tone === 'primary' ? 4 : 1,
      }}
      {...rest}>
      {children}
    </View>
  );
}
